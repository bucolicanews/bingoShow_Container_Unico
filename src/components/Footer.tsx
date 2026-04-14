export const Footer = () => {
  return (
    <footer className="py-6 print:hidden">
      <div className="container max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
        <p>Bingo Show App - Criado com ❤️</p>
        <a 
          href="/docs.html" 
          target="_blank" 
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs text-blue-600 hover:underline"
        >
          Documentação Técnica
        </a>
      </div>
    </footer>
  );
};