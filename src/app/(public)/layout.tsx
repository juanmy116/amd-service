import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#BF0D0D]"
      >
        Aller au contenu
      </a>
      <Navigation />
      <main id="contenu" className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
