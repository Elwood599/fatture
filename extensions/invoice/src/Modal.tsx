import { Text, Screen, useApi, reactExtension, Navigator, ScrollView } from '@shopify/ui-extensions-react/point-of-sale';
import { useEffect, useState } from 'react';

const InvoiceModal = () => {
  const api = useApi<'pos.order-details.action.render'>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  
  useEffect(() => {
    const checkRequested = async () => {
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
            }
          }
        `;

        const response = await fetch(`shopify:admin/api/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query }),
        });

        const data = await response.json();

        const requestedField = data.data.order.metafields.edges.find((m: any) => m.node.key === 'requested');

        if (requestedField?.node.value === 'true') {
          setStatus('success');
        } else {
          setStatus('error');
        }
      } catch (err) {
        console.error(err);
        setStatus('error');
      }
    };

    checkRequested();
  }, [api]);

  return (
    <Navigator>
      <Screen name="OrderDetailAction" title="Conferma richiesta fattura">
        <ScrollView>
          
          {status === 'loading' && <Text>Verifica stato richiesta fattura...</Text>}
          {status === 'success' && <Text>✅ La fattura è stata richiesta correttamente!</Text>}
          {status === 'error' && <Text>❌ Si è verificato un errore: la fattura non è stata richiesta.</Text>}
          
        </ScrollView>
      </Screen>
    </Navigator>
  );
};

export default reactExtension(
  'pos.order-details.action.render',
  (props) => <InvoiceModal />
);
