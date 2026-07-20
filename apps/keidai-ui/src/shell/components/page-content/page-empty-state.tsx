import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  cn,
} from "@keidai/ui";
import type { ReactNode } from "react";

export interface PageEmptyStateProps {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function PageEmptyState({
  icon,
  title,
  description,
  action,
  footer,
  className,
  contentClassName,
}: PageEmptyStateProps) {
  return (
    <Empty
      className={cn(
        "border border-dashed border-border bg-card py-[60px] md:py-[60px]",
        contentClassName,
        className,
      )}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
      {footer}
    </Empty>
  );
}
