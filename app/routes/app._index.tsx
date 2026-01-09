import {
  Card,
  Badge,
  Button,
  IndexFilters,
  IndexTable,
  Text,
  TabProps,
  IndexFiltersProps,
  useIndexResourceState,
  useSetIndexFiltersMode,
} from "@shopify/polaris";
import { ViewIcon, PrintIcon } from "@shopify/polaris-icons";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import { authenticate } from "app/shopify.server";
import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useCallback, useEffect, useState } from "react";
import { createApp } from "@shopify/app-bridge";
import { Redirect } from "@shopify/app-bridge/actions";

/* ---------------- LOADER ---------------- */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return {
    shop: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

/* ---------------- ACTION ---------------- */

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();

  const first = 15;
  const after = form.get("after")?.toString() || null;

  const query = `
    query GetOrders($first: Int!, $after: String) {
      orders(
        first: $first,
        after: $after,
        sortKey: CREATED_AT,
        reverse: true
      ) {
        edges {
          cursor
          node {
            id
            name
            createdAt
            unpaid
            displayFulfillmentStatus
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            lineItems(first: 100) {
              edges { node { id } }
            }
            customer {
              displayName
              firstName
              lastName
              email
              metafield_ragione_sociale: metafield(
                namespace: "invoice"
                key: "ragione_sociale"
              ) {
                value
              }
            }
            requested: metafield(namespace: "invoice", key: "requested") {
              value
            }
            emitted: metafield(namespace: "invoice", key: "emitted") {
              value
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const response = await admin.graphql(query, {
    variables: { first, after },
  });

  const json = await response.json();

  const orders = json.data.orders.edges
    .map((e: any) => e.node)
    .filter((o: any) => o.requested?.value === "true");

  return {
    orders,
    pageInfo: json.data.orders.pageInfo,
  };
};

/* ---------------- COMPONENT ---------------- */

export default function Index() {
  const { apiKey } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  const [rawOrders, setRawOrders] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);

  /* ---------------- TABS ---------------- */

  const [tabsLabels, setTabsLabels] = useState(["All", "Emitted", "Not emitted"]);
  const [selectedTab, setSelectedTab] = useState(0);

  const tabs: TabProps[] = tabsLabels.map((t, i) => ({
    content: t,
    index: i,
    id: `${t}-${i}`,
    isLocked: i === 0,
  }));

  /* ---------------- FILTERS ---------------- */

  const sortOptions: IndexFiltersProps["sortOptions"] = [
    { label: "Order", value: "order asc", directionLabel: "A-Z" },
    { label: "Order", value: "order desc", directionLabel: "Z-A" },
    { label: "Date", value: "date asc", directionLabel: "Oldest" },
    { label: "Date", value: "date desc", directionLabel: "Newest" },
    { label: "Total", value: "total asc", directionLabel: "Ascending" },
    { label: "Total", value: "total desc", directionLabel: "Descending" },
  ];

  const [sortSelected, setSortSelected] = useState(["date desc"]);
  const [queryValue, setQueryValue] = useState("");

  const { mode, setMode } = useSetIndexFiltersMode();

  /* ---------------- FETCH ---------------- */

  useEffect(() => {
    fetcher.submit({}, { method: "post" });
  }, []);

  useEffect(() => {
    if (!fetcher.data?.orders) return;

    const newOrders = fetcher.data.orders;

    setRawOrders((prev) =>
      fetcher.data?.pageInfo?.endCursor && prev.length
        ? [...prev, ...newOrders]
        : newOrders
    );

    setHasNextPage(fetcher.data.pageInfo.hasNextPage);
    setEndCursor(fetcher.data.pageInfo.endCursor);
  }, [fetcher.data]);

  /* ---------------- PROCESS DATA ---------------- */

  useEffect(() => {
    let result = [...rawOrders];

    // Tab filter
    result = result.filter((o) => {
      if (tabsLabels[selectedTab] === "Emitted") return o.emitted?.value === "true";
      if (tabsLabels[selectedTab] === "Not emitted") return o.emitted?.value !== "true";
      return true;
    });

    // Search
    if (queryValue) {
      const term = queryValue.toLowerCase();
      result = result.filter((o) =>
        o.name.toLowerCase().includes(term) ||
        o.customer?.email?.toLowerCase().includes(term)
      );
    }

    // Sorting (Shopify default = date desc)
    const [field, direction] = sortSelected[0].split(" ");
    if (!(field === "date" && direction === "desc")) {
      result.sort((a, b) => {
        let aVal: any;
        let bVal: any;

        if (field === "date") {
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
        }

        if (field === "total") {
          aVal = parseFloat(a.totalPriceSet.shopMoney.amount);
          bVal = parseFloat(b.totalPriceSet.shopMoney.amount);
        }

        if (field === "order") {
          aVal = a.name;
          bVal = b.name;
        }

        return direction === "asc" ? aVal - bVal : bVal - aVal;
      });
    }

    setOrders(result);
  }, [rawOrders, selectedTab, queryValue, sortSelected]);

  /* ---------------- TABLE ---------------- */

  const { selectedResources, handleSelectionChange } =
    useIndexResourceState(orders);

  const rows = orders.map((o, i) => {
    const id = o.id.split("/").pop();

    return (
      <IndexTable.Row id={id} key={id} position={i}>
        <IndexTable.Cell>{o.name}</IndexTable.Cell>
        <IndexTable.Cell>
          {new Date(o.createdAt).toLocaleString("it-IT")}
        </IndexTable.Cell>
        <IndexTable.Cell>{o.customer?.displayName || "-"}</IndexTable.Cell>
        <IndexTable.Cell>
          {o.totalPriceSet.shopMoney.amount}{" "}
          {o.totalPriceSet.shopMoney.currencyCode}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge>{o.unpaid ? "Unpaid" : "Paid"}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge>{o.displayFulfillmentStatus}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>{o.lineItems.edges.length}</IndexTable.Cell>
        <IndexTable.Cell>
          {o.emitted?.value === "true" ? <Badge tone="success">Emitted</Badge> : <Badge tone="warning">Not emitted</Badge>}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Button
            icon={ViewIcon}
            onClick={() => redirectToOrder(id)}
          >
            View
          </Button>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Button
            icon={PrintIcon}
            onClick={() => navigate(`/app/${id}/proforma`)}
          >
            Proforma
          </Button>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Card>
      <IndexFilters
        sortOptions={sortOptions}
        sortSelected={sortSelected}
        onSort={setSortSelected}
        queryValue={queryValue}
        onQueryChange={setQueryValue}
        tabs={tabs}
        selected={selectedTab}
        onSelect={setSelectedTab}
        mode={mode}
        setMode={setMode}
        filters={[]}
        hideFilters
      />

      <IndexTable
        resourceName={{ singular: "order", plural: "orders" }}
        itemCount={orders.length}
        selectable={false}
        selectedItemsCount={selectedResources.length}
        onSelectionChange={handleSelectionChange}
        headings={[
          { title: "Order" },
          { title: "Date" },
          { title: "Customer" },
          { title: "Total" },
          { title: "Payment" },
          { title: "Fulfillment" },
          { title: "Items" },
          { title: "Invoice" },
          { title: "Link" },
          { title: "Proforma" },
        ]}
      >
        {rows}
      </IndexTable>

      {hasNextPage && (
        <div style={{ padding: 16, textAlign: "center" }}>
          <Button
            onClick={() => {
              const fd = new FormData();
              fd.append("after", endCursor || "");
              fetcher.submit(fd, { method: "post" });
            }}
          >
            Load more
          </Button>
        </div>
      )}
    </Card>
  );

  function getShopifyHost(): string {
    if (typeof window === "undefined") return "";

    const params = new URLSearchParams(window.location.search);
    const hostFromUrl = params.get("host");

    if (hostFromUrl) {
      sessionStorage.setItem("shopify_host", hostFromUrl);
      return hostFromUrl;
    }

    return sessionStorage.getItem("shopify_host") || "";
  }
  
  function redirectToOrder(orderId: string) {
    const host = getShopifyHost();

    if (!host) {
      console.error("Shopify host missing");
      return;
    }

    const app = createApp({
      apiKey,
      host,
      forceRedirect: true,
    });

    const redirect = Redirect.create(app);

    redirect.dispatch(Redirect.Action.ADMIN_PATH, {
      path: `/orders/${orderId}`,
      newContext: true,
    });
  }
}
