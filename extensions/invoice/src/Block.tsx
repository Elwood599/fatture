import { Text, useApi, reactExtension, POSBlock, POSBlockRow, Badge, Button } from '@shopify/ui-extensions-react/point-of-sale';
import { useEffect, useState, useRef } from 'react';
import { fetchInvoiceData, InvoiceState, requestInvoice } from '../../../app/invoiceApi';

const Block = () => {
  const api = useApi<'pos.order-details.block.render'>();
  const [invoiceState, setInvoiceState] = useState<InvoiceState>({
    requested: false,
    emitted: null,
    missingCustomerFields: [],
    customerId: undefined,
  });
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const data = await fetchInvoiceData(api);
    setInvoiceState(data);
    setLoading(false);
  };

    useEffect(() => {
      loadData();
    }, [api.order.id, api.order.customerId]);

  const { requested, emitted, missingCustomerFields, customerId } = invoiceState;

  return (
    <POSBlock>
      <POSBlockRow>
        <Text>{requested ? '✅ È stata richiesta la fattura' : '❌ Non è stata richiesta la fattura'}</Text>
      </POSBlockRow>
      <POSBlockRow>
        <Text>{emitted ? '✅ La fattura è stata emessa' : '❌ La fattura non è stata emessa'}</Text>
      </POSBlockRow>

      {!api.order.customerId && (
        <>
          <POSBlockRow>
            <Badge text="Azione necessaria per richiedere la fattura" variant="warning" />
          </POSBlockRow>
          <POSBlockRow>
            <Text>La fattura non può essere richiesta perché l'ordine non ha un Cliente associato.</Text>
          </POSBlockRow>
        </>
      )}

      {missingCustomerFields.length > 0 && (
        <>
          <POSBlockRow>
            <Badge text="Azione necessaria per richiedere la fattura" variant="warning" />
          </POSBlockRow>
          <POSBlockRow>
            <Text>La fattura non può essere richiesta perché mancano i seguenti dati del cliente:</Text>
          </POSBlockRow>
          <POSBlockRow>
            <Text>- {missingCustomerFields.join('\n- ')}</Text>
          </POSBlockRow>
        </>
      )}
      <POSBlockRow>
        <Text>{'\u00A0'}</Text>
      </POSBlockRow>
      <POSBlockRow>
        <Button
          title="Richiedi fattura"
          type='primary'
          onPress={async () => {
            setLoading(true);
            api.toast.show('Attendere...', { duration: 3000 });
            try {
              await requestInvoice(api);
              await loadData();
              api.toast.show('Fattura richiesta correttamente', { duration: 10000 });
            } catch (error) {
              api.toast.show('Errore durante la richiesta fattura', { duration: 10000 });
              console.error(error);
            } finally {
              setLoading(false);
            }
          }}
          isDisabled={requested || !api.order.customerId || missingCustomerFields.length > 0 || loading}
        >
        </Button>
      </POSBlockRow>
    </POSBlock>
  );
};

export default reactExtension(
  'pos.order-details.block.render',
  () => <Block />
);
