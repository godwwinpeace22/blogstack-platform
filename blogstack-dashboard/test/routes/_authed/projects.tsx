import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Plus, Globe, Settings } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
} from "@blogstack/ui";
import { useProjects, useCreateProject } from "@blogstack/sdk/react";

import { api } from "../../lib/api";
import type { Plan } from "@blogstack/sdk";

export const Route = createFileRoute("/_authed/projects")({
  component: ProjectsPage,
});

const PLAN_COLORS: Record<Plan, "default" | "secondary" | "outline"> = {
  hobby: "outline",
  pro: "default",
  team: "secondary",
};

function ProjectsPage() {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");

  const { data, isLoading, error } = useProjects(api);
  const createMutation = useCreateProject(api, {
    onSuccess: (project) => {
      setOpen(false);
      setName("");
      setSlug("");
      void navigate({
        to: "/projects/$projectId",
        params: { projectId: project.id },
      });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({ name, ...(slug ? { slug } : {}) });
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">
            Manage your blogs and publications
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New project
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-36 animate-pulse bg-muted" />
          ))}
        </div>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">
              Failed to load projects. Please refresh.
            </p>
          </CardContent>
        </Card>
      )}

      {data && data.projects.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <Globe className="mb-4 h-12 w-12 text-muted-foreground" />
          <CardTitle className="mb-2 text-xl">No projects yet</CardTitle>
          <CardDescription className="mb-4">
            Create your first project to start publishing
          </CardDescription>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create project
          </Button>
        </Card>
      )}

      {data && data.projects.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.projects.map((project) => (
            <Link
              key={project.id}
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className="group"
            >
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <CardHeader className="flex-row items-start justify-between pb-2">
                  <CardTitle className="text-base">{project.name}</CardTitle>
                  <Badge variant="outline">{project.slug}</Badge>
                </CardHeader>
                <CardContent>
                  {project.description && (
                    <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                      {project.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Settings className="h-3 w-3" />
                    {project.customDomain ?? `${project.slug}.blogstack.dev`}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create project dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="proj-name">Project name</Label>
              <Input
                id="proj-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Blog"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-slug">
                Slug <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="proj-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-blog"
                pattern="[a-z0-9-]+"
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers and hyphens only. Auto-generated if
                blank.
              </p>
            </div>
            {createMutation.error && (
              <p className="text-sm text-destructive">
                {createMutation.error.message}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
