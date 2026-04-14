import { useNavigate } from 'react-router-dom';
import { useGame } from '@/contexts/GameContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { PrintableBingoCard } from '@/components/PrintableBingoCard';
import { ArrowLeft, Printer } from 'lucide-react';

const PrintView = () => {
  const navigate = useNavigate();
  const { playerCards } = useGame();
  const { profile } = useAuth();

  if (!profile) {
    navigate('/');
    return null;
  }

  const myOwnedCards = playerCards.filter(c => c.player_id === profile.id);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="print-container p-8 bg-muted min-h-screen">
      <header className="print-hide flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="text-center sm:text-left">
          <h1 className="text-3xl font-bold font-heading">Imprimir Cartelas</h1>
          <p className="text-muted-foreground">
            {myOwnedCards.length} cartela(s) pronta(s) para impressão.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={() => navigate('/')} className="w-full sm:w-auto">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao Lobby
          </Button>
          <Button onClick={handlePrint} className="w-full sm:w-auto">
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
        </div>
      </header>

      {myOwnedCards.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted-foreground">Você não tem cartelas para imprimir.</p>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-8">
          {myOwnedCards.map(card => (
            <PrintableBingoCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
};

export default PrintView;