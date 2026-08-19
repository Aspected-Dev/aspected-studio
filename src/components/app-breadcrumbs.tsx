import { Fragment } from "react";
import { Link, useLocation } from "react-router";
import { useConnection } from "@/hooks/use-connection.tsx";
import { breadcrumbsForLocation } from "@/lib/app-nav.ts";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb.tsx";

/**
 * Header trail for the current Studio route.
 */
export function AppBreadcrumbs() {
  const { pathname } = useLocation();
  const { status } = useConnection();
  const crumbs = breadcrumbsForLocation(pathname, {
    connected: status !== null,
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem>
                {last || !crumb.href
                  ? (
                    <BreadcrumbPage className="max-w-48 truncate">
                      {crumb.label}
                    </BreadcrumbPage>
                  )
                  : (
                    <BreadcrumbLink render={<Link to={crumb.href} />}>
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
