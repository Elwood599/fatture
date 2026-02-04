import { LoaderFunctionArgs, json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import crypto from "crypto"; // o import { createHmac } from "crypto";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  // 1. GESTIONE CORS (Permetti al POS di chiamare questo endpoint)
  // Questo è fondamentale per evitare "Failed to fetch"
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };

  // Se è una richiesta pre-flight (OPTIONS), rispondi subito OK
  if (request.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  try {
    // 2. Autenticazione
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const orderId = params.orderId;
    
    // Attenzione: request.url potrebbe essere http interno, meglio forzare l'URL pubblico se lo conosci
    // Oppure fidarsi dell'origin della request se dietro proxy
    const appUrl = new URL(request.url).origin; 

    // 3. Firma
    const signature = crypto
      .createHmac("sha256", process.env.SHOPIFY_API_SECRET!)
      .update(`${orderId}${shop}`)
      .digest("hex");

    const printUrl = `${appUrl}/print/proforma/${orderId}?sig=${signature}&shop=${shop}`;

    // 4. Ritorna JSON con gli headers CORS
    return json({ url: printUrl }, { headers });

  } catch (error) {
    console.error("Errore loader POS:", error);
    // Anche in caso di errore, ritorna gli header CORS per permettere al client di leggere l'errore
    return json({ error: "Server error" }, { status: 500, headers });
  }
};