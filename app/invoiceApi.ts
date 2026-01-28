// invoiceApi.ts
export interface InvoiceState {
  requested: boolean;
  emitted: boolean | null;
  missingCustomerFields: string[];
  customerId?: undefined;
}

export const REQUIRED_CUSTOMER_FIELDS_COMPANY = [
  'ragione_sociale',
  'partita_iva',
  'sede_legale_via',
  'sede_legale_cap',
  'sede_legale_citta',
  'sede_legale_provincia',
];

export const CUSTOMER_FIELD_LABELS: Record<string, string> = {
  customer_type: 'Tipo cliente',
  codice_fiscale: 'Codice fiscale',
  ragione_sociale: 'Ragione sociale',
  partita_iva: 'Partita IVA',
  sede_legale_via: 'Via sede legale',
  sede_legale_cap: 'CAP sede legale',
  sede_legale_citta: 'Città sede legale',
  sede_legale_provincia: 'Provincia sede legale',
};

export const fetchInvoiceData = async (api: any): Promise<InvoiceState> => {
  if (!api.order.id) return { requested: false, emitted: null, missingCustomerFields: [], customerId: undefined };

  try {
    const token = await api.session.getSessionToken();

    const query = `
      query {
        order(id: "gid://shopify/Order/${api.order.id}") {
          metafields(namespace: "invoice", first: 5) {
            edges { node { key value } }
          }
          customer {
            id
            metafields(namespace: "invoice", first: 20) {
              edges { node { key value } }
            }
          }
        }
      }
    `;

    const response = await fetch('shopify:admin/api/graphql.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();
    const order = data.data.order;

    // Metafields ordine
    const orderMetafields = order.metafields.edges;
    const requestedField = orderMetafields.find((m: any) => m.node.key === 'requested');
    const emittedField = orderMetafields.find((m: any) => m.node.key === 'emitted');

    const requested = requestedField ? requestedField.node.value === 'true' : false;
    const emitted = emittedField ? emittedField.node.value === 'true' : null;

    // Controllo customer
    let missingCustomerFields: string[] = [];
    if (!requested && order.customer) {
      const customerMetafields: Record<string, string> = {};
      order.customer.metafields.edges.forEach((edge: any) => {
        customerMetafields[edge.node.key] = edge.node.value;
      });

      const customerType = customerMetafields['customer_type'];

      if (!customerType || customerType.trim() === '') missingCustomerFields.push('Tipo cliente');
      else if (customerType === 'Individual' && (!customerMetafields['codice_fiscale'] || customerMetafields['codice_fiscale'].trim() === '')) {
        missingCustomerFields.push('codice_fiscale');
      } else if (customerType === 'Company') {
        missingCustomerFields = REQUIRED_CUSTOMER_FIELDS_COMPANY.filter(key => !customerMetafields[key]?.trim());
      }
    }

    const customerId = order.customer?.id;

    return { requested, emitted, missingCustomerFields, customerId };
  } catch (error) {
    console.error('Errore fetchInvoiceData:', error);
    return { requested: false, emitted: null, missingCustomerFields: [], customerId: undefined };
  }
};

export const requestInvoice = async (api: any): Promise<void> => {
  const token = await api.session.getSessionToken();

  // Preleva i dati customer per salvare metafields
  let invoiceData: Record<string, string> = { requested: 'true', emitted: 'false' };
  if (api.order.customerId) {
    const customerQuery = `
      query {
        customer(id: "gid://shopify/Customer/${api.order.customerId}") {
          metafields(namespace: "invoice", first: 50) { edges { node { key value } } }
        }
      }
    `;
    const customerResponse = await fetch('shopify:admin/api/graphql.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
        userErrors { field message }
      }
    }
  `;

  const response = await fetch('shopify:admin/api/graphql.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: mutation }),
  });

  const result = await response.json();
  if (result.data.metafieldsSet.userErrors.length)
    throw new Error(result.data.metafieldsSet.userErrors[0].message);
};
