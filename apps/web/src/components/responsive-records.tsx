import type { ReactNode } from "react";

export function ResponsiveRecords({
  cards,
  table,
}: {
  cards: ReactNode;
  table: ReactNode;
}) {
  return (
    <div className="@container">
      <div className="@min-[42rem]:hidden">{cards}</div>
      <div className="hidden overflow-x-auto @min-[42rem]:block">{table}</div>
    </div>
  );
}
