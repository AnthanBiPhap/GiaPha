import { cn, initials } from "@/lib/utils";

type AvatarProps = {
  name: string;
  src?: string | null;
  className?: string;
};

export function Avatar({ name, src, className }: AvatarProps) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={cn(
          "h-10 w-10 rounded-md object-cover border border-border",
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted text-xs font-medium text-muted-foreground",
        className,
      )}
      aria-label={name}
    >
      {initials(name) || "?"}
    </div>
  );
}
