import type { ReactNode } from "react";

export function ResponsiveRecords({
  cards,
  table,
}: {
  cards: ReactNode;
  table: ReactNode;
}) {
  return (
    <div>
      <div className="lg:hidden">{cards}</div>
      <div className="hidden overflow-x-auto lg:block">{table}</div>
    </div>
  );
}
