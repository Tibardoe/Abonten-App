import BackButton from "@/components/atoms/BackButton";
import { cn } from "@/components/lib/utils";
import { PageTitle } from "@/components/ui/typography";

type PageHeaderProps = {
  title: string;
  showBackButton?: boolean;
  className?: string;
};

// Single shared page-title treatment, replacing three ad-hoc ones that had
// drifted to the same visual style independently: MobileSettingsHeaderNav
// (back button + centered title), Finances' hardcoded <h1>, and any other
// page that hand-rolled the same `font-bold text-xl md:text-2xl` heading
// instead of reusing the PageTitle atom.
export default function PageHeader({
  title,
  showBackButton = false,
  className,
}: PageHeaderProps) {
  if (showBackButton) {
    return (
      <div className={cn("flex items-center w-full", className)}>
        <BackButton />
        <PageTitle className="mx-auto">{title}</PageTitle>
      </div>
    );
  }

  return <PageTitle className={className}>{title}</PageTitle>;
}
