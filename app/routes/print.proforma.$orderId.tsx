// app/routes/print.proforma.$orderId.tsx
import { LoaderFunctionArgs } from "@remix-run/node";
import { Liquid } from "liquidjs";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import shopify from "../shopify.server";

// In-memory cache for rendered HTML (5-minute TTL)
interface CacheEntry {
  html: string;
  timestamp: number;
}
const htmlCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Export for use in other routes
export function getCachedHtml(cacheKey: string): string | null {
  const entry = htmlCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    htmlCache.delete(cacheKey);
    return null;
  }
  return entry.html;
}

export function setCachedHtml(cacheKey: string, html: string): void {
  htmlCache.set(cacheKey, { html, timestamp: Date.now() });
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const orderId = params.orderId;
  const signature = url.searchParams.get("sig");
  const shop = url.searchParams.get("shop");

  if (!orderId || !shop || !process.env.SHOPIFY_API_SECRET) {
    return new Response("Missing parameters", { status: 400 });
  }

  // 1. Validazione Firma (Sicurezza)
  const expectedSignature = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
    .update(`${orderId}${shop}`)
    .digest("hex");

  if (signature !== expectedSignature) {
    return new Response("Unauthorized Access", { status: 401 });
  }

  // Check cache first
  const cacheKey = `${orderId}_${shop}`;
  const cachedHtml = getCachedHtml(cacheKey);
  if (cachedHtml) {
    return new Response(cachedHtml, {
      headers: {
        "Content-Type": "text/html",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      },
    });
  }

  try {
    // 2. RECUPERA SESSIONE OFFLINE
    // Serve per avere l'Access Token senza login utente
    const sessionId = `offline_${shop}`;
    const session = await shopify.sessionStorage.loadSession(sessionId);

    if (!session || !session.accessToken) {
      throw new Error("Sessione offline non trovata. Reinstallare l'app.");
    }

    const graphqlEndpoint = `https://${shop}/admin/api/2026-01/graphql.json`;
    const headers = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": session.accessToken,
    };

    // 3. QUERY 1: DATI ORDINE (La tua query completa)
    const cleanId = orderId.replace(/\D/g, "");
    const orderGid = `gid://shopify/Order/${cleanId}`;

    const orderQuery = `
      query GetOrderForProforma($id: ID!) {
        order(id: $id) {
          id
          name
          createdAt
          poNumber
          metafield_requested: metafield(namespace: "invoice", key: "requested") { value }
          metafield_order_invoice_data: metafield(namespace: "invoice", key: "invoice_data") { value }
          customer {
            id
            firstName
            lastName
            displayName
            email
            phone
            defaultAddress {
              address1
              city
              province
              provinceCode
              zip
              country
            }
            metafield_partita_iva: metafield(namespace: "invoice", key: "partita_iva") { value }
            metafield_codice_fiscale: metafield(namespace: "invoice", key: "codice_fiscale") { value }
            metafield_pec: metafield(namespace: "invoice", key: "pec") { value }
            metafield_sdi: metafield(namespace: "invoice", key: "codice_sdi") { value }
            metafield_ragione_sociale: metafield(namespace: "invoice", key: "ragione_sociale") { value }
            metafield_customer_type: metafield(namespace: "invoice", key: "customer_type") { value }
            metafield_sede_legale_via: metafield(namespace: "invoice", key: "sede_legale_via") { value }
            metafield_sede_legale_cap: metafield(namespace: "invoice", key: "sede_legale_cap") { value }
            metafield_sede_legale_citta: metafield(namespace: "invoice", key: "sede_legale_citta") { value }
            metafield_sede_legale_provincia: metafield(namespace: "invoice", key: "sede_legale_provincia") { value }
            metafield_invoice_data: metafield(namespace: "invoice", key: "invoice_data") { value }
          }
          billingAddress {
            address1
            address2
            city
            province
            zip
            country
            phone
          }
          shippingAddress {
            address1
            address2
            city
            province
            zip
            country
            phone
          }
          lineItems(first: 100) {
            edges {
              node {
                id
                title
                variantTitle
                sku
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                discountedUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                taxLines {
                  ratePercentage
                  title
                }
                discountAllocations {
                  discountApplication {
                      value {
                        ... on PricingPercentageValue {
                          percentage
                        }
                      }
                    }
                  allocatedAmountSet {
                    shopMoney {
                      amount
                    }
                  }
                }
              }
            }
          }
          totalDiscountsSet {
            shopMoney {
              amount
            }
          }
          subtotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          taxLines {
            ratePercentage
          }
          totalTaxSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          paymentGatewayNames
          transactions( first: 10 ) {
            formattedGateway
            amount
            status
            createdAt
          }
        }
      }
    `;

    // Esegui fetch Ordine
    const orderRes = await fetch(graphqlEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: orderQuery, variables: { id: orderGid } }),
    });
    const orderJson = await orderRes.json();
    
    if(orderJson.errors) {
        console.error("GraphQL Order Errors:", orderJson.errors);
        throw new Error("Errore query Ordine");
    }
    const order = orderJson.data.order;

    // 4. QUERY 2: DATI SHOP (La tua query completa)
    const shopQuery = `
      query GetShopData {
        shop {
          id
          name
          email
          myshopifyDomain
          billingAddress {
            address1
            address2
            city
            province
            zip
            country
          }
          metafield_partita_iva: metafield(namespace: "company", key: "partita_iva") { value }
          metafield_codice_fiscale: metafield(namespace: "company", key: "codice_fiscale") { value }
          metafield_rea: metafield(namespace: "company", key: "rea") { value }
          metafield_capitale_sociale: metafield(namespace: "company", key: "capitale_sociale") { value }
          metafield_pec: metafield(namespace: "company", key: "pec") { value }
          metafield_sdi: metafield(namespace: "company", key: "codice_sdi") { value }
        }
      }
    `;

    // Esegui fetch Shop
    const shopRes = await fetch(graphqlEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: shopQuery }),
    });
    const shopJson = await shopRes.json();
    const shopData = shopJson.data.shop;


    // 5. LOGICA DI ELABORAZIONE (Copiata dal tuo file originale)
    
    // Parse invoice_data from order (snapshot at purchase time)
    let invoiceDataFromOrder: any = null;
    try {
      if (order.metafield_order_invoice_data?.value) {
        invoiceDataFromOrder = JSON.parse(order.metafield_order_invoice_data.value);
      }
    } catch (e) {
      console.error("[PROFORMA] Error parsing order invoice_data:", e);
    }

    const getInvoiceField = (fieldName: string) => {
      if (invoiceDataFromOrder && invoiceDataFromOrder[fieldName] !== undefined) {
        return invoiceDataFromOrder[fieldName];
      }
      const metafieldKey = `metafield_${fieldName}`;
      // @ts-ignore
      return order.customer?.[metafieldKey]?.value || null;
    };

    const getSedeLegale = () => {
      if (invoiceDataFromOrder?.sede_legale) {
        return invoiceDataFromOrder.sede_legale;
      }
      return {
        via: order.customer?.metafield_sede_legale_via?.value || null,
        cap: order.customer?.metafield_sede_legale_cap?.value || null,
        citta: order.customer?.metafield_sede_legale_citta?.value || null,
        provincia: order.customer?.metafield_sede_legale_provincia?.value || null,
      };
    };

    // 6. PREPARAZIONE DATI LIQUID
    const liquidData = {
      order: {
        order_name: order.name,
        created_at: order.createdAt,
        po_number: order.poNumber || null,
        customer: {
          id: order.customer?.id || null,
          name: order.customer?.displayName || `${order.customer?.firstName || ""} ${order.customer?.lastName || ""}`.trim() || null,
          email: order.customer?.email || null,
          phone: order.customer?.phone || null,
          address: order.customer?.defaultAddress?.address1 || null,
          city: order.customer?.defaultAddress?.city || null,
          province: order.customer?.defaultAddress?.province || null,
          provinceCode: order.customer?.defaultAddress?.provinceCode || null,
          zip: order.customer?.defaultAddress?.zip || null,
          country: order.customer?.defaultAddress?.country || null,
          metafields: {
            invoice: {
              customer_type: getInvoiceField('customer_type') || 'company',
              ragione_sociale: getInvoiceField('ragione_sociale'),
              partita_iva: getInvoiceField('partita_iva'),
              codice_fiscale: getInvoiceField('codice_fiscale'),
              pec: getInvoiceField('pec'),
              codice_destinatario: getInvoiceField('codice_sdi'),
              sede_legale: getSedeLegale(),
            }
          }
        },
        billing_address: order.billingAddress
          ? {
              address1: order.billingAddress.address1,
              address2: order.billingAddress.address2,
              city: order.billingAddress.city,
              province: order.billingAddress.province,
              zip: order.billingAddress.zip,
              country: order.billingAddress.country,
              phone: order.billingAddress.phone,
            }
          : null,
        shipping_address: order.shippingAddress
          ? {
              address1: order.shippingAddress.address1,
              address2: order.shippingAddress.address2,
              city: order.shippingAddress.city,
              province: order.shippingAddress.province,
              zip: order.shippingAddress.zip,
              country: order.shippingAddress.country,
              phone: order.shippingAddress.phone,
            }
          : null,
        line_items: order.lineItems.edges.map((edge: any) => ({
          title: edge.node.title,
          variant_title: edge.node.variantTitle || "",
          sku: edge.node.sku || "",
          quantity: edge.node.quantity,
          original_price: edge.node.originalUnitPriceSet.shopMoney.amount,
          final_price: edge.node.discountedUnitPriceSet.shopMoney.amount,
          tax_lines: edge.node.taxLines || [],
          line_level_discount_allocations: edge.node.discountAllocations || [],
          percentage_discount: edge.node.discountAllocations || [],
          final_line_price: (
            parseFloat(edge.node.discountedUnitPriceSet.shopMoney.amount) *
            edge.node.quantity
          ).toFixed(2),
        })),
        total_discount: order.totalDiscountsSet.shopMoney.amount,
        line_items_subtotal_price: order.subtotalPriceSet.shopMoney.amount,
        shipping_price: order.totalShippingPriceSet.shopMoney.amount,
        tax_code: order.taxLines[0].ratePercentage || "",
        tax_price: order.totalTaxSet.shopMoney.amount,
        total_price: order.totalPriceSet.shopMoney.amount,
        discount_applications: [],
        total_refunded_amount: 0,
        net_payment: order.totalPriceSet.shopMoney.amount,
        total_net_amount: order.totalPriceSet.shopMoney.amount,
        gateway: order.transactions || null,
        payment_terms: null,
        currency: order.totalPriceSet.shopMoney.currencyCode,
      },
      shop: {
        name: shopData.name,
        email: shopData.email,
        address: shopData.billingAddress
          ? {
              address1: shopData.billingAddress.address1,
              address2: shopData.billingAddress.address2,
              city: shopData.billingAddress.city,
              province: shopData.billingAddress.province,
              zip: shopData.billingAddress.zip,
              country: shopData.billingAddress.country,
            }
          : null,
        metafields: {
          company: {
            partita_iva: shopData.metafield_partita_iva?.value || null,
            codice_fiscale: shopData.metafield_codice_fiscale?.value || null,
            rea: shopData.metafield_rea?.value || null,
            capitale_sociale: shopData.metafield_capitale_sociale?.value || null,
            pec: shopData.metafield_pec?.value || null,
            codice_sdi: shopData.metafield_sdi?.value || null,
          }
        }
      },
    };

    // 7. RENDER LIQUID CON FILTRI
    const engine = new Liquid();
    const templatePath = path.join(process.cwd(), "invoice-proforma-template.liquid");

    if (!fs.existsSync(templatePath)) {
       throw new Error("Template file not found");
    }
    const templateContent = fs.readFileSync(templatePath, "utf8");

    // --- REGISTRAZIONE FILTRI (Copiati dal tuo codice) ---
    engine.registerFilter("format_address", (address: any) => {
      if (!address) return "";
      const parts = [
        address.address1,
        address.address2,
        `${address.zip || ""} ${address.city || ""}`.trim(),
        address.province,
        address.country,
      ].filter(Boolean);
      return parts.join(", ");
    });

    engine.registerFilter("date", (value: string, format: string) => {
      const date = new Date(value);
      if (format && format.includes("%d/%m/%Y")) {
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
      }
      return date.toLocaleDateString("it-IT");
    });

    engine.registerFilter("money", (value: string | number) => {
      const amount = typeof value === "string" ? parseFloat(value) : value;
      return `€${amount.toFixed(2).replace(".", ",")}`;
    });

    engine.registerFilter("payment_method", (gateway: string) => {
      if (!gateway) return "Da definire";
      const paymentMethods: Record<string, string> = {
        "cash": "Contanti",
        "manual": "Manuale",
        "bank_transfer": "Bonifico bancario",
        "shopify_payments": "Shopify Payments",
        "paypal": "PayPal",
        "stripe": "Carta di credito",
        "bogus": "Test (Bogus Gateway)",
      };
      const lowerGateway = gateway.toLowerCase();
      return paymentMethods[lowerGateway] || gateway;
    });

    const renderedHtml = await engine.parseAndRender(templateContent, liquidData);

    // Cache the rendered HTML for subsequent requests
    setCachedHtml(cacheKey, renderedHtml);

    return new Response(renderedHtml, {
      headers: { 
        "Content-Type": "text/html",
        "Access-Control-Allow-Origin": "*", // 👈 PERMETTE IL PRE-FETCH DAL POS
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "no-cache, no-store, must-revalidate" // Evita cache vecchie
      },
    });

  } catch (error) {
    console.error("Errore generazione stampa:", error);
    return new Response(`Errore`, { 
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" } // Anche l'errore deve essere leggibile
    });
  }
};