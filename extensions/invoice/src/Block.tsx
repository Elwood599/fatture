import {
  Text,
  useApi,
  reactExtension,
  POSBlock,
  POSBlockRow,
  Badge,
  Icon
} from '@shopify/ui-extensions-react/point-of-sale';
import { useEffect, useState } from 'react';

interface Metafields {
  requested: boolean | null;
  emitted: boolean | null;
}

/* Campi obbligatori SOLO per company */
const REQUIRED_CUSTOMER_FIELDS_COMPANY = [
  'ragione_sociale',
  'partita_iva',
  'sede_legale_via',
  'sede_legale_cap',
  'sede_legale_citta',
  'sede_legale_provincia',
];

const Block = () => {
  const api = useApi<'pos.order-details.block.render'>();

  const [invoiceState, setInvoiceState] = useState<Metafields>({
    requested: null,
    emitted: null,
  });

  const [missingCustomerFields, setMissingCustomerFields] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!api.order.id) return;

      try {
        const token = await api.session.getSessionToken();

        const query = `
          query {
            order(id: "gid://shopify/Order/${api.order.id}") {
              metafields(namespace: "invoice", first: 5) {
                edges {
                  node {
                    key
                    value
                  }
                }
              }
              customer {
                metafields(namespace: "invoice", first: 20) {
                  edges {
                    node {
                      key
                      value
                    }
                  }
                }
              }
            }
          }
        `;

        const response = await fetch('shopify:admin/api/graphql.json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query }),
        });

        const data = await response.json();
        const order = data.data.order;

        /* ---------- metafield ordine ---------- */
        const orderMetafields = order.metafields.edges;
        const requestedField = orderMetafields.find((m: any) => m.node.key === 'requested');
        const emittedField = orderMetafields.find((m: any) => m.node.key === 'emitted');

        const requested = requestedField ? requestedField.node.value === 'true' : false;
        const emitted = emittedField ? emittedField.node.value === 'true' : null;

        setInvoiceState({ requested, emitted });

        /* ---------- controllo customer ---------- */
        if (!requested && order.customer) {
          const customerMetafields: Record<string, string> = {};

          order.customer.metafields.edges.forEach((edge: any) => {
            customerMetafields[edge.node.key] = edge.node.value;
          });

          const customerType = customerMetafields['customer_type'];

          // 1️⃣ customer_type NON compilato
          if (!customerType || customerType.trim() === '') {
            setMissingCustomerFields(['Customer type']);
            return;
          }

          // 2️⃣ customer_type = individual → solo codice_fiscale
          if (customerType === 'individual') {
            const missing =
              !customerMetafields['codice_fiscale'] ||
              customerMetafields['codice_fiscale'].trim() === ''
                ? ['codice_fiscale']
                : [];

            setMissingCustomerFields(missing);
            return;
          }

          // 3️⃣ customer_type = company → campi aziendali
          if (customerType === 'company') {
            const missing = REQUIRED_CUSTOMER_FIELDS_COMPANY.filter(
              (key) =>
                !customerMetafields[key] ||
                customerMetafields[key].trim() === ''
            );

            setMissingCustomerFields(missing);
            return;
          }

          setMissingCustomerFields([]);
        } else {
          setMissingCustomerFields([]);
        }
      } catch (error) {
        console.error('Errore fetch dati fattura:', error);
        setInvoiceState({ requested: null, emitted: null });
        setMissingCustomerFields([]);
      }
    };

    fetchData();
  }, [api.order.id]);

  const { requested, emitted } = invoiceState;

  let messageRequest = '';
  let messageEmitted = '';
  
  if (requested === true) {
    messageRequest = '✅ È stata richiesta la fattura per questo ordine.';
  } else {
    messageRequest = '❌ Non è stata richiesta la fattura per questo ordine.';
  }

  if (emitted === true) {
    messageEmitted = '✅ La fattura è stata emessa.';
  } else {
    messageEmitted = '❌ La fattura non è stata emessa.';
  }

  return (
    <POSBlock>
      <POSBlockRow>
        <Text>{messageRequest}</Text>
      </POSBlockRow>

      <POSBlockRow>
        <Text>{messageEmitted}</Text>
      </POSBlockRow>

      {!api.order.customerId && (
        <>
        <POSBlockRow>
          <Badge
            text="Azione necessaria per richiedere la fattura"
            variant="warning"
          />
        </POSBlockRow>

        <POSBlockRow>
          <Text>
            La fattura non può essere richiesta perché l'ordine non ha un Cliente associato.
          </Text>
        </POSBlockRow>
        </>
      )}

      {missingCustomerFields.length > 0 && (
        <>
          <POSBlockRow>
            <Badge
              text="Azione necessaria per richiedere la fattura"
              variant="warning"
            />
          </POSBlockRow>

          <POSBlockRow>
            <Text>
              La fattura non può essere richiesta perché mancano i seguenti dati del cliente:
            </Text>
          </POSBlockRow>

          <POSBlockRow>
            <Text>- {missingCustomerFields.join('\n- ')}</Text>
          </POSBlockRow>
        </>
      )}
    </POSBlock>
  );
};

export default reactExtension(
  'pos.order-details.block.render',
  () => <Block />
);
