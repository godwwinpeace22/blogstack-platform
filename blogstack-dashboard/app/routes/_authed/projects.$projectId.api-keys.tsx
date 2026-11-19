import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, Copy, Check, KeyRound } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@blogstack/ui";
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
} from "@blogstack/sdk/react";

import { api } from "../../lib/api";
import type { CreateApiKeyResponse } from "@blogstack/sdk";

export const Route = createFileRoute("/_authed/projects/$projectId/api-keys")({
  component: ApiKeysPage,
});

function ApiKeysPage() {
  const { projectId } = Route.useParams();
  const { data, isLoading } = useApiKeys(api, projectId);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [newKey, setNewKey] = React.useState<CreateApiKeyResponse | null>(null);
  const [revokeId, setRevokeId] = React.useState<string | null>(null);
  const [keyName, setKeyName] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  const createMutation = useCreateApiKey(api, projectId, {
    onSuccess: (key) => {
      setNewKey(key);
      setCreateOpen(false);
      setKeyName("");
    },
  });
  const revokeMutation = useRevokeApiKey(api, projectId, {
    onSuccess: () => setRevokeId(null),
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({ name: keyName });
  }

  function copyKey(key: string) {
    void navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const keys = data ?? [];

  return (
    <div className="space-y-6">
      {/* Newly created key — show once */}
      {newKey && (
        <Card className="border-green-500/40 bg-green-500/5">
          <CardHeader>
            <CardTitle className="text-base">
              API key created — save it now!
            </CardTitle>
            <CardDescription>
              This key won't be shown again. Copy it and store it securely.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-3 py-2 font-mono text-sm break-all">
                {newKey.plaintext}
              </code>
              <Button
                size="icon"
                variant="outline"
                onClick={() => copyKey(newKey.plaintext)}
                title="Copy"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setNewKey(null)}>
              I've saved the key
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">API Keys</h2>
          <p className="text-sm text-muted-foreground">
            Keys are masked after creation — only the prefix is stored.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New key
        </Button>
      </div>

      {/* Keys table */}
      <div className="rounded-lg border">
        {isLoading && (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        )}

        {!isLoading && keys.length === 0 && (
          <div className="flex flex-col items-center py-12 text-center text-muted-foreground gap-3">
            <KeyRound className="h-8 w-8 opacity-30" />
            <p>No API keys yet.</p>
          </div>
        )}

        {keys.length > 0 && (
          <div className="divide-y">
            {keys.map((key) => (
              <div key={key.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{key.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {key.keyPrefix}••••••••••••••••••••••••••••••••
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground shrink-0">
                  <p>
                    Created{" "}
                    {new Date(key.createdAt * 1000).toLocaleDateString()}
                  </p>
                  {key.lastUsedAt && (
                    <p>
                      Last used{" "}
                      {new Date(key.lastUsedAt * 1000).toLocaleDateString()}
                    </p>
                  )}
                  {!key.lastUsedAt && <p className="italic">Never used</p>}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setRevokeId(key.id)}
                  title="Revoke"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create key dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setKeyName("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="e.g. Production deployment"
                required
              />
              <p className="text-xs text-muted-foreground">
                A descriptive label to identify this key.
              </p>
            </div>
            {createMutation.error && (
              <p className="text-sm text-destructive">
                {createMutation.error.message}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || !keyName.trim()}
              >
                {createMutation.isPending ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm dialog */}
      <Dialog open={!!revokeId} onOpenChange={(o) => !o && setRevokeId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API key?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Any requests using this key will immediately start failing. This
            action cannot be undone.
          </p>
          {revokeMutation.error && (
            <p className="text-sm text-destructive">
              {revokeMutation.error.message}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => revokeId && revokeMutation.mutate(revokeId)}
            >
              {revokeMutation.isPending ? "Revoking…" : "Revoke key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
