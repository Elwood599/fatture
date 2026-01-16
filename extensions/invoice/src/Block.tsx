import { Text, useApi, reactExtension, POSBlock, POSBlockRow, Badge, Button } from '@shopify/ui-extensions-react/point-of-sale';
import { useEffect, useState } from 'react';
import { fetchInvoiceData } from '../../../app/invoiceApi';

const Block = () => {
  const api = useApi<'pos.order-details.block.render'>();
  const [invoiceState, setInvoiceState] = useState({ requested: false, emitted: null, missingCustomerFields: [] });
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const data = await fetchInvoiceData(api);
    setInvoiceState(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // Opzionale: polling per aggiornare il blocco ogni 5s
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [api.order.id]);

  const { requested, emitted, missingCustomerFields } = invoiceState;

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

      {requested === true && (
        <>
          <POSBlockRow>
            <Text>{'\u00A0'}</Text>
          </POSBlockRow>
          <POSBlockRow>
            <Button
              title="Proforma"
              onPress={async () => {
                try {
                  const url = `../../../app/${api.order.id}/proforma?pos=true`;
                  await api.print.print(url);
                } catch (error) {
                  console.error('Errore stampa proforma', error);
                }
              }}
            />
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
