import { AppHeader } from './AppHeader';
import { Footer } from './Footer';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen bg-background flex flex-col print:bg-white">
      <AppHeader />
      <main className="flex-grow container max-w-6xl mx-auto py-6 sm:py-8 print:p-0 print:max-w-none">
        {children}
      </main>
      <Footer />
    </div>
  );
};