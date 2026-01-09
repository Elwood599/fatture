import {
  Button,
  reactExtension,
  useApi
} from '@shopify/ui-extensions-react/point-of-sale';
import { useEffect, useState } from 'react';

const MenuItem = () => {
  const api = useApi<'pos.order-details.action.menu-item.render'>();

  const [requested, setRequested] = useState<boolean>(false);
  const [isCustomerValid, setIsCustomerValid] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!api.order.id) return;

      try {
        const token = await api.session.getSessionToken();

        // ---------- query order ----------
        const orderQuery = `
          query {
            order(id: "gid://shopify/Order/${api.order.id}") {
              id
              metafields(namespace: "invoice", first: 5) {
                edges {
                  node {
                    key
                    value
                  }
                }
              }
            }
          }
        `;

        const orderResponse = await fetch('shopify:admin/api/graphql.json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query: orderQuery }),
        });

        const orderData = await orderResponse.json();
        const order = orderData.data.order;

        // ---------- stato requested ----------
        const requestedField = order.metafields.edges.find(
          (m: any) => m.node.key === 'requested'
        );
        setRequested(requestedField?.node.value === 'true');

        // ---------- validazione customer ----------
        if (!api.order.customerId) {
          setIsCustomerValid(false);
          return;
        }

        const customerQuery = `
          query {
            customer(id: "gid://shopify/Customer/${api.order.customerId}") {
              metafields(namespace: "invoice", first: 50) {
                edges {
                  node {
                    key
                    value
                  }
                }
              }
            }
          }
        `;

        const customerResponse = await fetch('shopify:admin/api/graphql.json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query: customerQuery }),
        });

        const customerData = await customerResponse.json();
        const customerMetafields: Record<string, string> = {};
        customerData.data.customer.metafields.edges.forEach((edge: any) => {
          customerMetafields[edge.node.key] = edge.node.value;
        });

        // ---------- validazione: almeno customer_type e codice_fiscale per individual ----------
        const customerType = customerMetafields['customer_type'];
        if (!customerType) {
          setIsCustomerValid(false);
          return;
        }

        if (customerType === 'individual') {
          setIsCustomerValid(!!customerMetafields['codice_fiscale']?.trim());
        } else if (customerType === 'company') {
          const requiredFields = [
            'ragione_sociale',
            'partita_iva',
            'sede_legale_via',
            'sede_legale_cap',
            'sede_legale_citta',
            'sede_legale_provincia',
          ];
          const missing = requiredFields.some((key) => !customerMetafields[key]?.trim());
          setIsCustomerValid(!missing);
        } else {
          setIsCustomerValid(false);
        }
      } catch (error) {
        console.error('Errore fetch dati:', error);
        setIsCustomerValid(false);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [api.order.id, api.order.customerId]);

  const handleRequestInvoice = async () => {
    try {
      setSubmitting(true);
      const token = await api.session.getSessionToken();

      let invoiceData: Record<string, string> = { requested: "true", emitted: "false" };

      if (api.order.customerId) {
        const customerQuery = `
          query {
            customer(id: "gid://shopify/Customer/${api.order.customerId}") {
              metafields(namespace: "invoice", first: 50) {
                edges {
                  node {
                    key
                    value
                  }
                }
              }
            }
          }
        `;

        const customerResponse = await fetch('shopify:admin/api/graphql.json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query: customerQuery }),
        });

        const customerData = await customerResponse.json();
        customerData.data.customer.metafields.edges.forEach((edge: any) => {
          invoiceData[edge.node.key] = edge.node.value;
        });
      }

      const invoiceDataJson = JSON.stringify(invoiceData);

      const mutation = `
        mutation {
          metafieldsSet(metafields: [
            {
              ownerId: "gid://shopify/Order/${api.order.id}",
              namespace: "invoice",
              key: "requested",
              type: "boolean",
              value: "true"
            },
            {
              ownerId: "gid://shopify/Order/${api.order.id}",
              namespace: "invoice",
              key: "invoice_data",
              type: "json",
              value: """${invoiceDataJson}"""
            }
          ]) {
            metafields {
              id
              key
              value
            }
            userErrors {
              field
              message
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
        body: JSON.stringify({ query: mutation }),
      });

      const result = await response.json();

      if (result.data.metafieldsSet.userErrors.length) {
        throw new Error(result.data.metafieldsSet.userErrors[0].message);
      }

      setRequested(true);
      api.action.presentModal();
    } finally {
      setSubmitting(false);
    }

  };

  return (
    <Button
      onPress={handleRequestInvoice}
      isDisabled={requested || !isCustomerValid || loading || submitting}
    >
      Richiedi fattura
    </Button>
  );
};

export default reactExtension(
  'pos.order-details.action.menu-item.render',
  () => <MenuItem />
);
