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
```
SERVER=<span style="color: green">adress serwera np: http://localhost:3000</span>
SERVER_USER=<span style="color: green">nazwa użytkownika na serwerze</span>
SERVER_PASS=<span style="color: green">hasło użytkownika na serwerze</span>
```
w katalogu `extension` należy najpierw pobrać pakiety używając \
`npm install` \
następnie w celu kompilacji wtyczki należy użyć komendy \
`npm run build` gotowa wtyczka będzie się znajdować w katalogu extension/dist
### Kompilacja i uruchomienie serwera
> [!NOTE]  
> W celu działania własnego serwera wymagane jest posiadanie własnego tokenu openrouter

W celu konfiguracji serwera należy utworzyć plik `.env` w katalogu `extension` i wypełnić go podanymi zmiennymi:
```
OPENROUTER_API_KEY= # <span style="color: green">klucz open routera</span>
PORT= # <span style="color: green">port na którym serwer ma być hostowany</span>

OPENROUTER_MODEL= # <span style="color: green">model chata np: x-ai/grok-4.1-fast</span>
OPENROUTER_BASE_URL= # <span style="color: green">adress openrouter: https://openrouter.ai/api/v1</span>
OPENROUTER_SITE_URL= # <span style="color: green">address serwera: http://localhost:3000</span>
OPENROUTER_APP_NAME= # <span style="color: green">nazwa aplikacji</span>

ANALYZER_MAX_SENTENCES=200 # <span style="color: green">maksymalna liczba zdań w artykule</span>
ANALYZER_TEMPERATURE=0.1
ANALYZER_CACHE_TTL_MS=600000
```
przed uruchomieniem serwera wymaga jest instalacja pakietów node.js w tym celu używamy komendy \
`npm install` \
następnie w celu kompilacji serwera musimy użyć \
`npm run build` aby uruchomić serwer należy użyć komendy `npm run start` \
w celach debugowania zamiast dwóch powyższych komend można użyć też `npm run dev` które posiada odświeżanie po edycji