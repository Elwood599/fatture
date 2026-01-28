import {
  Text,
  useApi,
  reactExtension,
  POSBlock,
  POSBlockRow,
  Badge,
  Button
} from '@shopify/ui-extensions-react/point-of-sale';
import { useEffect, useState } from 'react';
// Assumo che questo file esista come dal tuo snippet
import { fetchInvoiceData, requestInvoice, InvoiceState, CUSTOMER_FIELD_LABELS } from '../../../app/invoiceApi';

const Block = () => {
  const api = useApi<'pos.order-details.block.render'>();
  
  // Stato per la gestione fattura
  const [invoiceState, setInvoiceState] =
  useState<InvoiceState>({
    requested: false,
    emitted: null,
    missingCustomerFields: [],
    customerId: undefined,
  });
  
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  // Caricamento dati iniziali
  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchInvoiceData(api);
      setInvoiceState(data);
    } catch (e) {
      console.error("Errore caricamento dati fattura", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [api.order.id, api.order.customerId]);

  const { requested, emitted, missingCustomerFields } = invoiceState;
  const readableMissingFields = missingCustomerFields.map(
    field => CUSTOMER_FIELD_LABELS[field] ?? field.replace(/_/g, ' ')
  );


  // --- FUNZIONE DI STAMPA ROBUSTA (BASE64) ---
  const handlePrint = async () => {
    setPrinting(true);

    try {
    
      const token = await api.session.getSessionToken();

      // 1. Ottieni URL
      const response = await fetch(`/app/pos/${api.order.id}/proforma`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error("Errore comunicazione server");
      const data = await response.json();

      if (data.error) throw new Error(data.error);
      if (!data.url) throw new Error("URL di stampa mancante");

      await api.storage.set('printUrl', data.url);
      await api.action.presentModal();


    } catch (error) {
      console.error('Errore stampa:', error);
      api.toast.show('Errore durante la stampa', { duration: 5000 });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <POSBlock>
      {/* Stato Richiesta */}
      <POSBlockRow>
        <Text>{requested ? '✅ È stata richiesta la fattura' : '❌ Non è stata richiesta la fattura'}</Text>
      </POSBlockRow>
      
      {/* Stato Emissione 
      <POSBlockRow>
        <Text>{emitted ? '✅ La fattura è stata emessa' : '❌ La fattura non è stata emessa'}</Text>
      </POSBlockRow> */}

      {/* Warning: Manca Cliente */}
      {!api.order.customerId && (
        <>
          <POSBlockRow>
            <Badge text="Azione necessaria" variant="warning" />
          </POSBlockRow>
          <POSBlockRow>
            <Text>Ordine senza cliente associato.</Text>
          </POSBlockRow>
        </>
      )}

      {/* Warning: Campi mancanti */}
      {missingCustomerFields.length > 0 && (
        <>
          <POSBlockRow>
            <Badge text="Dati mancanti" variant="warning" />
          </POSBlockRow>
          {readableMissingFields.map((field, index) => (
            <POSBlockRow key={index}>
              <Text>• {field}</Text>
            </POSBlockRow>
          ))}
        </>
      )}

      <POSBlockRow>
        <Text>{'\u00A0'}</Text>
      </POSBlockRow>

      {/* Bottone Richiedi Fattura */}
      <POSBlockRow>
        <Button
          title="Richiedi fattura"
          onPress={async () => {
            setLoading(true);
            api.toast.show('Richiesta in corso...', { duration: 3000 });
            try {
              await requestInvoice(api);
              await loadData();
              api.toast.show('Fattura richiesta correttamente', { duration: 5000 });
            } catch (error) {
              api.toast.show('Errore richiesta fattura', { duration: 5000 });
              console.error(error);
            } finally {
              setLoading(false);
            }
          }}
          isDisabled={requested || !api.order.customerId || missingCustomerFields.length > 0 || loading}
        />
      </POSBlockRow>

      {/* Bottone Stampa (Visibile solo se richiesta) */}
      {requested === true && (
        <>
          <POSBlockRow>
            <Text>{'\u00A0'}</Text>
          </POSBlockRow>
          <POSBlockRow>
            <Button
              title={printing ? "Caricamento..." : "Vedi fattura proforma"}
              onPress={handlePrint}
              isDisabled={printing || loading}
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