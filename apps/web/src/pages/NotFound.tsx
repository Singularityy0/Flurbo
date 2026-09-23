import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return <main id="main" tabIndex={-1} className="not-found section-light"><span className="eyebrow">That page drifted away</span><h1>Nothing here yet.</h1><p>Head back to the Flurbo preview and keep exploring the connection.</p><Link href="/" className="button button-dark">Back to flurbo <ArrowUpRight size={17} /></Link></main>;
}
