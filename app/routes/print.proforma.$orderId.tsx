import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { Liquid } from "liquidjs";
import fs from "fs";
import path from "path";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const orderId = params.orderId!;
  const orderGid = `gid://shopify/Order/${orderId}`;

  // 👉 tua query (identica)
  // 👉 costruisci liquidData (identico)

  const engine = new Liquid();
  const template = fs.readFileSync(
    path.join(process.cwd(), "invoice-proforma-template.liquid"),
    "utf8"
  );

  //const html = await engine.parseAndRender(template, liquidData);

  return new Response(
    `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Proforma</title>
<style>
  body { margin:0; font-family:Arial }
  @media print {
    @page { margin: 12mm }
  }
</style>
</head>
<body>
ciao
</body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
};
