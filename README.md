# Factcheck 
Wtyczka do przeglądarki chrome pozwalająca na weryfikacje treści stron z informacjiami. \
Pozwala stwierdzić czy podany test jest faktem czy opiniom w tym celu wykorzystuje sztuczną inteligencję. \
Projekt został utworzony przez: \
 - Mikołaja Gaweł-Kucab 
 - Wiktora Golicza 

na konkurs.
## Uruchmienie wtyczki


## Kompilacja programu
### Kompilacja wtyczki
W celu konfiguracji wtyczki należy utworzyć plik `.env` w katalogu `extension` i wypełnić go następującymi wartościami:
```bash
SERVER=http://localhost:3000  #adress serwera
SERVER_USER=twoja_nazwa #nazwa użytkownika na serwerze
SERVER_PASS=twoje_hasło #hasło
```
w katalogu `extension` należy najpierw pobrać pakiety używając \
`npm install` \
następnie w celu kompilacji wtyczki należy użyć komendy \
`npm run build` gotowa wtyczka będzie się znajdować w katalogu extension/dist
### Kompilacja i uruchomienie serwera
> [!NOTE]  
> W celu działania własnego serwera wymagane jest posiadanie własnego tokenu openrouter

W celu konfiguracji serwera należy utworzyć plik `.env` w katalogu `extension` i wypełnić go podanymi zmiennymi:
```bash
OPENROUTER_API_KEY=twój_klucz  #klucz API OpenRouter
PORT=3000    #Port serwera (np. 3000)

OPENROUTER_MODEL=x-ai/grok-4.1-fast #Model (np. x-ai/grok-4.1-fast, openai/gpt-4o itp.)
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1   # Adres API OpenRouter
OPENROUTER_SITE_URL=http://localhost:3000 # Adres Twojego serwera
OPENROUTER_APP_NAME=Wtyczka # Nazwa aplikacji

ANALYZER_MAX_SENTENCES=200 # maksymalna liczba zdań w artykule
ANALYZER_TEMPERATURE=0.1 # poziom stabilności modelu
ANALYZER_CACHE_TTL_MS=600000 #długość przechowywania modelu w cache-u 
```
przed uruchomieniem serwera wymaga jest instalacja pakietów node.js w tym celu używamy komendy \
`npm install` \
następnie w celu kompilacji serwera musimy użyć \
`npm run build` aby uruchomić serwer należy użyć komendy `npm run start` \
w celach debugowania zamiast dwóch powyższych komend można użyć też `npm run dev` które posiada odświeżanie po edycji