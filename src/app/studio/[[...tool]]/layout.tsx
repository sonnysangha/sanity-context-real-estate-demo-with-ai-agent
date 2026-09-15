export const metadata = {
  title: "Studio · HomeMatch NYC",
  robots: { index: false, follow: false },
};
export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="studio-root">{children}</div>;
}
