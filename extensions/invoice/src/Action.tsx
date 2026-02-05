import { Button, reactExtension, useApi } from '@shopify/ui-extensions-react/point-of-sale';
import { useEffect, useState } from 'react';
import { fetchInvoiceData, requestInvoice } from '../../../app/invoiceApi';

const MenuItem = () => {
  const api = useApi<'pos.order-details.action.menu-item.render'>();
  const [requested, setRequested] = useState(false);
  const [isCustomerValid, setIsCustomerValid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

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

  const handlePrint = async () => {
    setPrinting(true);

    try {
      
      const APP_URL = "https://fatture-three.vercel.app";
      const token = await api.session.getSessionToken();
      
      // 1. Ottieni URL
      const response = await fetch(`${APP_URL}/app/pos/${api.order.id}/proforma`, {
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
    <Button
      onPress={handlePrint}
      isDisabled={!requested || !isCustomerValid || loading || printing}
    />
  );
};

export default reactExtension(
  'pos.order-details.action.menu-item.render',
  () => <MenuItem />
);
