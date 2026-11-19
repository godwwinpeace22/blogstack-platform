import * as React from "react";
import { test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../src/components/tabs.js";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../src/components/accordion.js";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "../src/components/alert-dialog.js";
import { SearchBar } from "../src/components/search-bar.js";
import { TagFilter } from "../src/components/tag-filter.js";
import { BlogList } from "../src/components/blog-list.js";
import { Avatar } from "../src/components/avatar.js";
import { cn } from "../src/lib/cn.js";

test("class overrides win without discarding unrelated styles", () => {
  expect(cn("p-4 text-sm", "p-8")).toBe("text-sm p-8");
});
test("tabs expose selected state and switch by keyboard", async () => {
  const user = userEvent.setup();
  render(
    <Tabs defaultValue="one">
      <TabsList aria-label="Views">
        <TabsTrigger value="one">First</TabsTrigger>
        <TabsTrigger value="two">Second</TabsTrigger>
      </TabsList>
      <TabsContent value="one">First content</TabsContent>
      <TabsContent value="two">Second content</TabsContent>
    </Tabs>,
  );
  await user.tab();
  await user.keyboard("{ArrowRight}");
  expect(
    screen.getByRole("tab", { name: "Second" }).getAttribute("aria-selected"),
  ).toBe("true");
  expect(screen.getByRole("tabpanel").textContent).toBe("Second content");
});
test("accordion can be opened with the keyboard", async () => {
  const user = userEvent.setup();
  render(
    <Accordion type="single" collapsible>
      <AccordionItem value="item">
        <AccordionTrigger>Details</AccordionTrigger>
        <AccordionContent>Content</AccordionContent>
      </AccordionItem>
    </Accordion>,
  );
  await user.tab();
  await user.keyboard("{Enter}");
  expect(
    screen
      .getByRole("button", { name: "Details" })
      .getAttribute("aria-expanded"),
  ).toBe("true");
});
test("confirmation dialog restores focus after cancel", async () => {
  const user = userEvent.setup();
  render(
    <AlertDialog>
      <AlertDialogTrigger>Delete</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>Delete post?</AlertDialogTitle>
        <AlertDialogDescription>This removes the post.</AlertDialogDescription>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
      </AlertDialogContent>
    </AlertDialog>,
  );
  await user.click(screen.getByText("Delete"));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  await user.click(screen.getByText("Cancel"));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(document.activeElement).toBe(screen.getByText("Delete"));
});
test("search and filter expose controlled changes and accessible labels", async () => {
  const user = userEvent.setup();
  const search = vi.fn();
  const change = vi.fn();
  const filter = vi.fn();
  render(
    <>
      <SearchBar value="  react  " onValueChange={change} onSearch={search} />
      <TagFilter
        tags={[{ id: "react", name: "React", slug: "react" }]}
        onValueChange={filter}
      />
    </>,
  );
  await user.click(screen.getByRole("button", { name: "Search" }));
  expect(search).toHaveBeenCalledWith("react");
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "tailwind" },
  });
  expect(change).toHaveBeenCalledWith("tailwind");
  await user.click(screen.getByRole("button", { name: "React" }));
  expect(filter).toHaveBeenCalledWith("react");
});
test("empty lists have a usable fallback and avatar recovers with a new source", () => {
  const view = render(
    <>
      <BlogList posts={[]} />
      <Avatar src="/broken.png" alt="Author" fallback="A" />
    </>,
  );
  expect(screen.getByText("No posts found")).toBeTruthy();
  fireEvent.error(screen.getByAltText("Author"));
  expect(screen.getByText("A")).toBeTruthy();
  view.rerender(<Avatar src="/fixed.png" alt="Author" fallback="A" />);
  expect(screen.getByAltText("Author").getAttribute("src")).toBe("/fixed.png");
});
