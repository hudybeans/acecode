export function McpSchemaDetails({ schema }) {
  if (!schema) return null;
  return (
    <details className="mt-2 rounded-md border border-border bg-surface px-3.5 py-2.5">
      <summary className="cursor-pointer text-[12px] text-fg-2">查看配置 Schema</summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[12px] font-mono text-fg">
        {JSON.stringify(schema, null, 2)}
      </pre>
    </details>
  );
}
