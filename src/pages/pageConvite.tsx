import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ConviteBingoPage() {
  const url = "https://bingoshow.teusite.top/login";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 md:p-6 gap-10 overflow-x-hidden">

      {/* Apresentação */}
      <div className="text-center max-w-3xl w-full">
        <h1 className="text-3xl md:text-5xl font-bold mb-4">
          🎉 Bingo Show de Prêmios
        </h1>
        <p className="text-base md:text-lg text-muted-foreground">
          Participe agora do nosso bingo online! Diversão, prêmios e emoção em tempo real.
          Jogue de onde estiver e concorra a prêmios incríveis.
        </p>
      </div>

     

      {/* SEÇÕES DE VÍDEO */}
<div className="w-full max-w-6xl space-y-10" >
       {/* Apresentação */}
        <div>
          <h2 className="text-xl font-bold mb-2">📌 Seja Bem Vindo</h2>
          <Card>
            <CardContent className="p-2">
              <div className="aspect-video">
                <iframe className="w-full h-full rounded-xl" src="https://www.youtube.com/embed/dQw4w9WgXcQ" />
              </div>
            </CardContent>
          </Card>
    </div>

     {/* Cadastro */}
        <div>
          <h2 className="text-xl font-bold mb-2">👤 Cadastro</h2>
          <Card>
            <CardContent className="p-2">
              <div className="aspect-video">
                <iframe className="w-full h-full rounded-xl" src="https://www.youtube.com/embed/dQw4w9WgXcQ" />
              </div>
            </CardContent>
          </Card>
        </div>
        
     {/* Logar */}
        <div>
          <h2 className="text-xl font-bold mb-2">🟢 Logar</h2>
          <Card>
            <CardContent className="p-2">
              <div className="aspect-video">
                <iframe className="w-full h-full rounded-xl" src="https://www.youtube.com/embed/dQw4w9WgXcQ" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recuperar Senha */}
        <div>
          <h2 className="text-xl font-bold mb-2">🔑 Recuperar Senha</h2>
          <Card>
            <CardContent className="p-2">
              <div className="aspect-video">
                <iframe className="w-full h-full rounded-xl" src="https://www.youtube.com/embed/dQw4w9WgXcQ" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Comprar Créditos */}
        <div>
          <h2 className="text-xl font-bold mb-2">💰 Comprar Créditos</h2>
          <Card>
            <CardContent className="p-2">
              <div className="aspect-video">
                <iframe className="w-full h-full rounded-xl" src="https://www.youtube.com/embed/dQw4w9WgXcQ" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* BINGO */}
        <div>
          <h2 className="text-2xl font-bold">🎯 BINGO</h2>

          <div className="mt-4">
            <h3 className="font-semibold mb-2">🧾 Gerar Cartela</h3>
            <Card>
              <CardContent className="p-2">
                <div className="aspect-video">
                  <iframe className="w-full h-full rounded-xl" src="https://www.youtube.com/embed/dQw4w9WgXcQ" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-4">
            <h3 className="font-semibold mb-2">⚡ Entrar na Partida</h3>
            <Card>
              <CardContent className="p-2">
                <div className="aspect-video">
                  <iframe className="w-full h-full rounded-xl" src="https://www.youtube.com/embed/dQw4w9WgXcQ" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-4">
            <h3 className="font-semibold mb-2">📺 Ver ao Vivo</h3>
            <Card>
              <CardContent className="p-2">
                <div className="aspect-video">
                  <iframe className="w-full h-full rounded-xl" src="https://www.youtube.com/embed/dQw4w9WgXcQ" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* RIFA */}
        <div>
          <h2 className="text-2xl font-bold">🎟️ RIFA</h2>

          <div className="mt-4">
            <h3 className="font-semibold mb-2">👀 Ver Rifas Disponíveis</h3>
            <Card>
              <CardContent className="p-2">
                <div className="aspect-video">
                  <iframe className="w-full h-full rounded-xl" src="https://www.youtube.com/embed/dQw4w9WgXcQ" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-4">
            <h3 className="font-semibold mb-2">🪙 Comprar Números</h3>
            <Card>
              <CardContent className="p-2">
                <div className="aspect-video">
                  <iframe className="w-full h-full rounded-xl" src="https://www.youtube.com/embed/dQw4w9WgXcQ" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* PARTIDAS AUTOMÁTICAS */}
        <div>
          <h2 className="text-2xl font-bold">🤖 PARTIDAS AUTOMÁTICAS</h2>
          <Card className="mt-4">
            <CardContent className="p-2">
              <div className="aspect-video">
                <iframe className="w-full h-full rounded-xl" src="https://www.youtube.com/embed/dQw4w9WgXcQ" />
              </div>
            </CardContent>
          </Card>
                  </div>
                  
         {/* PARTIDAS RESGATAR DINHEIRO */}
        <div>
          <h2 className="text-2xl font-bold">💵 RESGATAR DINHEIRO</h2>
          <Card className="mt-4">
            <CardContent className="p-2">
              <div className="aspect-video">
                <iframe className="w-full h-full rounded-xl" src="https://www.youtube.com/embed/dQw4w9WgXcQ" />
              </div>
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Convite + QR Code */}
      <div className="text-center flex flex-col items-center gap-6 w-full">
        <h2 className="text-xl md:text-3xl font-semibold">
          Entre agora e comece a jogar!
        </h2>

        <div className="bg-white p-4 rounded-2xl shadow-lg">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${url}`}
            alt="QR Code"
            className="w-40 h-40 md:w-48 md:h-48"
          />
        </div>

        <Button size="lg" className="w-full max-w-xs" onClick={() => window.open(url, "_blank")}>
          Acessar Bingo
        </Button>

        <p className="text-xs md:text-sm text-muted-foreground break-all px-2">
          Ou acesse: {url}
        </p>

        <h1> Passo a Passo </h1>

        <p className="text-sm md:text-base text-muted-foreground max-w-2xl">
          1. Clique no botão "Acessar Bingo" ou escaneie o QR Code com seu celular.
          <br /><br />
          2. Crie sua conta para participar.
          - Será enviado um código de verificação para seu e-mail.
          <br /><br />
          3. Compre Créditos para jogar(opcional, mas recomendado para aproveitar ao máximo os prêmios).
          vá na haba lateral, clicando nos três traços no canto superior direito ao lado do icone da foto, escolha "Comprar Créditos" e escolha o pacote que mais te agrada.
          <br /><br />
          4. Crie uma ou Mais Cartelas no botão "NOVA CARTELA"!
          - Escolha seus números ab ABA Manual ou deixe o sistema escolher por você na aba "Aleatória".
          - Click Gerar Cartela Aleatória para receber uma cartela com números aleatórios.
          <br /><br />
          5. Vá na ABA Partidas "Abertas" e escolha a partida que deseja participar.
          - Clique em "Entrar" para participar da partida selecionada.
          <br /><br />
          6. Fique atento ao início da partida.
          <br /><br />
          7. As Aprtidas Iniciadas Irão para a ABA AOVIVO.
          - Entre para a acompanhar a chamada dos números em tempo real.
          - Acompanhe sua cartela e marque os números chamados.
          <br /><br />
          8. Se completar uma linha, coluna ou diagonal, grite "Bingo!" e concorra a prêmios incríveis!
          - O sistema irá verificar automaticamente se sua cartela é a vencedora.
          <br /><br />
          9. Aproveite a emoção do bingo online e boa sorte!
        </p>

      </div>

    </div>
  );
}
