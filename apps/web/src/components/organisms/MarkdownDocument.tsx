import type {
  BlockNode,
  InlineNode,
} from "@abonten/core/markdown/parseMarkdown";
import Link from "next/link";
import type { ReactNode } from "react";

// Renders the block tree from @abonten/core/markdown/parseMarkdown as
// theme-aware React elements. Used by the public legal pages and the help
// centre. No HTML strings are produced, so nothing needs sanitising; links
// that leave the site open in a new tab with rel=noopener.
//
// Keys: the tree is static content parsed at build time and never reordered,
// so a positional key is the stable identity of each node. `keyed` computes
// them once, outside JSX.

function keyed<T>(items: readonly T[], prefix: string) {
  return items.map((item, position) => ({
    key: `${prefix}-${position}`,
    item,
  }));
}

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

const LINK_CLASS =
  "font-medium text-primary underline underline-offset-4 hover:opacity-80";

function renderInline(nodes: InlineNode[], prefix: string): ReactNode[] {
  return keyed(nodes, prefix).map(({ key, item: node }) => {
    switch (node.type) {
      case "text":
        return node.text;
      case "strong":
        return (
          <strong key={key} className="font-semibold text-foreground">
            {renderInline(node.children, key)}
          </strong>
        );
      case "em":
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case "code":
        return (
          <code
            key={key}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
          >
            {node.text}
          </code>
        );
      case "link":
        return isExternal(node.href) ? (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            {renderInline(node.children, key)}
          </a>
        ) : (
          <Link key={key} href={node.href} className={LINK_CLASS}>
            {renderInline(node.children, key)}
          </Link>
        );
    }
  });
}

function Heading({
  block,
}: {
  block: Extract<BlockNode, { type: "heading" }>;
}) {
  const content = renderInline(block.children, block.id);
  const anchor = "scroll-mt-28";
  switch (block.level) {
    case 1:
      return (
        <h1
          id={block.id}
          className={`${anchor} text-2xl font-semibold md:text-3xl`}
        >
          {content}
        </h1>
      );
    case 2:
      return (
        <h2
          id={block.id}
          className={`${anchor} mt-10 border-b border-border pb-2 text-xl font-semibold`}
        >
          {content}
        </h2>
      );
    case 3:
      return (
        <h3 id={block.id} className={`${anchor} mt-6 text-lg font-semibold`}>
          {content}
        </h3>
      );
    default:
      return (
        <h4 id={block.id} className={`${anchor} mt-4 text-base font-medium`}>
          {content}
        </h4>
      );
  }
}

function ListBlock({
  block,
  prefix,
}: {
  block: Extract<BlockNode, { type: "list" }>;
  prefix: string;
}) {
  const items = keyed(block.items, prefix).map(({ key, item }) => (
    <li key={key}>{renderInline(item, key)}</li>
  ));
  return block.ordered ? (
    <ol className="list-decimal space-y-1.5 pl-6">{items}</ol>
  ) : (
    <ul className="list-disc space-y-1.5 pl-6">{items}</ul>
  );
}

function TableBlock({
  block,
  prefix,
}: {
  block: Extract<BlockNode, { type: "table" }>;
  prefix: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {keyed(block.header, `${prefix}-h`).map(({ key, item }) => (
              <th key={key} className="py-2 pr-4 font-semibold text-foreground">
                {renderInline(item, key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keyed(block.rows, `${prefix}-r`).map(
            ({ key: rowKey, item: row }) => (
              <tr key={rowKey} className="border-b border-border/60 align-top">
                {keyed(row, rowKey).map(({ key, item }) => (
                  <td key={key} className="py-2 pr-4">
                    {renderInline(item, key)}
                  </td>
                ))}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function MarkdownDocument({ blocks }: { blocks: BlockNode[] }) {
  return (
    <div className="flex flex-col gap-4 text-[15px] leading-7 text-foreground/90">
      {keyed(blocks, "b").map(({ key, item: block }) => {
        switch (block.type) {
          case "heading":
            return <Heading key={key} block={block} />;
          case "paragraph":
            return <p key={key}>{renderInline(block.children, key)}</p>;
          case "list":
            return <ListBlock key={key} block={block} prefix={key} />;
          case "blockquote":
            return (
              <blockquote
                key={key}
                className="rounded-md border-l-4 border-primary/60 bg-muted/60 px-4 py-3 text-sm text-muted-foreground"
              >
                {renderInline(block.children, key)}
              </blockquote>
            );
          case "hr":
            return <hr key={key} className="my-6 border-border" />;
          case "code":
            return (
              <pre
                key={key}
                className="overflow-x-auto rounded-md bg-muted p-4 font-mono text-sm"
              >
                <code>{block.text}</code>
              </pre>
            );
          case "table":
            return <TableBlock key={key} block={block} prefix={key} />;
        }
      })}
    </div>
  );
}
