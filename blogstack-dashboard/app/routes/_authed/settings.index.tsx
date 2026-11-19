import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BillingPanel } from "../../components/billing-panel";
export const Route = createFileRoute("/_authed/settings/")({
  component: Settings,
});
function Settings() {
  return <BillingPanel />;
}
