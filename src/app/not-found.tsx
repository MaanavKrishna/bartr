import { EmptyState } from "@/components/empty-state";

export default function NotFound() {
  return (
    <div className="container py-24">
      <EmptyState
        emoji="🧭"
        title="That page has been traded away"
        description="The listing may have been closed, or the link is wrong. The marketplace is still here."
        action={{ href: "/browse", label: "Back to browse" }}
      />
    </div>
  );
}
