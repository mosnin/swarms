import { cn } from "@/lib/utils";

/** Surface card — hairline border, soft rounding, subtle hover lift. */
export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-background shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]",
        interactive &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-[0_8px_24px_-8px_rgb(0_0_0/0.14)] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className,
      )}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
