import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";

export function SiteNav({
  links,
  extra,
}: {
  links: { href: string; label: string }[];
  extra?: ReactNode;
}) {
  return (
    <nav className="nav nav-pill">
      <a className="brand" href="/">
        <BrandMark />
        NCRP <span>One Case</span>
      </a>
      <div className="navlinks">
        {links.map((link) => (
          <a href={link.href} key={`${link.href}-${link.label}`}>
            {link.label}
          </a>
        ))}
        {extra}
      </div>
    </nav>
  );
}
