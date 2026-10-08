import Image from "next/image";
import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Baseline home">
      <BrandMark />
    </Link>
  );
}

export function BrandMark() {
  return <span className="brand-logo">
    <Image src="/baseline-logo-transparent.png" alt="" width={985} height={544} priority />
    {['symbol-main','symbol-accent','wordmark-main','wordmark-accent'].map(part => <span key={part} aria-hidden="true" className={`brand-layer brand-${part}`} />)}
  </span>;
}
