import { StoreFooter, StoreHeader } from "@/components/store/header";
import { currentUser } from "@/server/access";
import { currentCart } from "@/server/cart";

export default async function StoreLayout({ children }: LayoutProps<"/">) {
  const [user, cart] = await Promise.all([currentUser(), currentCart()]);
  return (
    <>
      <StoreHeader cartCount={cart.count} user={user} />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
      <StoreFooter />
    </>
  );
}
