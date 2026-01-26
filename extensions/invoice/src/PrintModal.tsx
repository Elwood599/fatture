import {
  Screen,
  PrintPreview,
  Button,
  Text,
  useApi,
  reactExtension,
  Navigator,
} from '@shopify/ui-extensions-react/point-of-sale';
import { useEffect, useState } from 'react';

const PrintModal = () => {
  const api = useApi<'pos.order-details.action.render'>();
  const [printUrl, setPrintUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPrintUrl = async () => {
      try {
        const url = await api.storage.get('printUrl');
        if (url) {
          setPrintUrl(url as string);
        }
      } catch (e) {
        console.error('Error loading print URL:', e);
      } finally {
        setLoading(false);
      }
    };
    loadPrintUrl();
  }, []);

  const handlePrint = async () => {
    if (!printUrl) {
      api.toast.show('URL di stampa non disponibile', { duration: 3000 });
      return;
    }

    try {
      await api.print.print(printUrl);
    } catch (error) {
      console.error('Errore stampa:', error);
      api.toast.show('Errore durante la stampa', { duration: 5000 });
    }
  };

  if (loading) {
    return (
      <Navigator>
        <Screen name="print-preview" title="Anteprima Proforma">
          <Text>Caricamento...</Text>
        </Screen>
      </Navigator>
    );
  }

  return (
    <Navigator>
      <Screen name="print-preview" title="Anteprima Proforma">
        {printUrl ? (
          <PrintPreview src={printUrl} />
        ) : (
          <Text>URL di stampa non disponibile</Text>
        )}
        <Button title="Stampa" type="primary" onPress={handlePrint} />
      </Screen>
    </Navigator>
  );
};

export default reactExtension(
  'pos.order-details.action.render',
  () => <PrintModal />
);
