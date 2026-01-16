import { Button, reactExtension, useApi } from '@shopify/ui-extensions-react/point-of-sale';
import { useEffect, useState } from 'react';
import { fetchInvoiceData, requestInvoice } from '../../../app/invoiceApi';

const MenuItem = () => {
  const api = useApi<'pos.order-details.action.menu-item.render'>();
  const [requested, setRequested] = useState(false);
  const [isCustomerValid, setIsCustomerValid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const data = await fetchInvoiceData(api);
    setRequested(data.requested);
    setIsCustomerValid(data.missingCustomerFields.length === 0);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [api.order.id, api.order.customerId]);

  const handleRequestInvoice = async () => {
    setSubmitting(true);
    api.toast.show('Attendere...', { duration: 3000 });

    try {
      await requestInvoice(api);
      setRequested(true);
      api.toast.show('Fattura richiesta correttamente', { duration: 10000 });
      // Lato Block, puoi aggiungere un polling o ricaricare fetchData periodicamente
    } catch (error) {
      api.toast.show('Errore durante la richiesta fattura', { duration: 10000 });
      console.error(error);
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
