import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { generateBingoCard, BINGO_RANGES } from '@/utils/bingoUtils';
import { AlertCircle, Info, Trash2, Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CardCreatorProps {
  onCardChange: (numbers: number[][] | null) => void;
}

// Function to create a valid 5x5 grid from a set of 24 numbers
const createGridFromNumbers = (selectedNumbers: Set<number>): { grid: number[][], error: string | null } => {
    if (selectedNumbers.size !== 24) {
        return { grid: [], error: `Selecione exatamente 24 números. Você selecionou ${selectedNumbers.size}.` };
    }

    const numbers = Array.from(selectedNumbers);
    const columns: number[][] = Array(5).fill(0).map(() => []);

    for (const num of numbers) {
        let placed = false;
        for (let i = 0; i < BINGO_RANGES.length; i++) {
            const range = BINGO_RANGES[i];
            if (num >= range.min && num <= range.max) {
                columns[i].push(num);
                placed = true;
                break;
            }
        }
        if (!placed) {
            return { grid: [], error: `Número inválido encontrado: ${num}` };
        }
    }

    const expectedCounts = [5, 5, 4, 5, 5];
    for (let i = 0; i < columns.length; i++) {
        if (columns[i].length !== expectedCounts[i]) {
            const range = BINGO_RANGES[i];
            return { grid: [], error: `A coluna ${range.col} (${range.min}-${range.max}) deve ter ${expectedCounts[i]} números. Você selecionou ${columns[i].length}.` };
        }
        columns[i].sort((a, b) => a - b);
    }

    const grid: number[][] = Array(5).fill(0).map(() => Array(5).fill(0));
    for (let col = 0; col < 5; col++) {
        for (let row = 0; row < 5; row++) {
            if (col === 2) { // Column N
                if (row < 2) grid[row][col] = columns[col][row];
                else if (row === 2) grid[row][col] = 0; // Free space
                else grid[row][col] = columns[col][row - 1];
            } else {
                grid[row][col] = columns[col][row];
            }
        }
    }

    return { grid, error: null };
};


export const CardCreator = ({ onCardChange }: CardCreatorProps) => {
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(new Set());
  const [textValue, setTextValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const allNumbers = Array.from({ length: 75 }, (_, i) => i + 1);

  // Sync state when selectedNumbers changes
  useEffect(() => {
    const numbersArray = Array.from(selectedNumbers).sort((a, b) => a - b);
    setTextValue(numbersArray.join(', '));

    const { grid, error: gridError } = createGridFromNumbers(selectedNumbers);
    setError(gridError);

    if (gridError) {
        onCardChange(null);
    } else {
        onCardChange(grid);
    }
  }, [selectedNumbers, onCardChange]);

  const handleNumberClick = (num: number) => {
    setSelectedNumbers(prev => {
        const next = new Set(prev);
        if (next.has(num)) {
            next.delete(num);
        } else {
            if (next.size < 24) {
                next.add(num);
            }
        }
        return next;
    });
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setTextValue(newText);

    const parsedNumbers = newText
        .split(/[\s,]+/)
        .map(n => parseInt(n.trim(), 10))
        .filter(n => !isNaN(n) && n >= 1 && n <= 75);
    
    setSelectedNumbers(new Set(parsedNumbers.slice(0, 24)));
  };

  const handleRandomize = () => {
    const randomGrid = generateBingoCard();
    const numbers = new Set(randomGrid.flat().filter(n => n !== 0));
    setSelectedNumbers(numbers);
  };

  const handleClear = () => {
    setSelectedNumbers(new Set());
  };

  return (
    <div className="space-y-4">
        <Tabs defaultValue="manual" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="manual">Manual</TabsTrigger>
                <TabsTrigger value="auto">Aleatório</TabsTrigger>
            </TabsList>
            <TabsContent value="manual" className="mt-4 space-y-4">
                <div className="grid grid-cols-10 gap-1">
                    {allNumbers.map(num => (
                        <button
                            key={num}
                            onClick={() => handleNumberClick(num)}
                            className={cn(
                                "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                                selectedNumbers.has(num) 
                                    ? "bg-primary text-primary-foreground" 
                                    : "bg-secondary hover:bg-muted"
                            )}
                        >
                            {num}
                        </button>
                    ))}
                </div>
                <Textarea
                    placeholder="Digite 24 números de 1 a 75, separados por vírgula."
                    value={textValue}
                    onChange={handleTextChange}
                    rows={3}
                    className="bg-secondary border-0 font-mono text-sm"
                />
                <Button type="button" variant="outline" className="w-full" onClick={handleClear}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Limpar Seleção
                </Button>
            </TabsContent>
            <TabsContent value="auto" className="mt-4 space-y-4 text-center">
                 <div className="grid grid-cols-10 gap-1">
                    {allNumbers.map(num => (
                        <button
                            key={num}
                            className={cn(
                                "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                                selectedNumbers.has(num) 
                                    ? "bg-primary text-primary-foreground" 
                                    : "bg-secondary"
                            )}
                        >
                            {num}
                        </button>
                    ))}
                </div>
                 <Textarea
                    value={textValue}
                    readOnly
                    rows={3}
                    className="bg-secondary border-0 font-mono text-sm"
                />
                <Button type="button" variant="outline" className="w-full" onClick={handleRandomize}>
                    <Shuffle className="w-4 h-4 mr-2" />
                    Gerar Cartela Aleatória
                </Button>
            </TabsContent>
        </Tabs>

        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Info className="w-4 h-4" />
                <span>Status da Cartela</span>
            </div>
            {error ? (
                <div className="flex items-start gap-2 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            ) : (
                <p className="text-sm text-success">
                    Cartela válida! Você selecionou 24 números corretamente.
                </p>
            )}
        </div>
    </div>
  );
};