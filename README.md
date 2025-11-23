# Factcheck 
Wtyczka do przeglądarki chrome pozwalająca na analizę treści artykułów informacjnych. \
Pozwala stwierdzić czy podany tekst jest faktem czy opinią - w tym celu wykorzystuje sztuczną inteligencję. \
Naszym celem jest walka z fake newsami oraz dezinformacją, która jest coraz bardziej powszechna w mediach. \
Wtyczka ma być swego rodzaju lupą analityczną, która przetwarza dokument aby użytkownik otrzymał nie stronnicze dane. \
Projekt został utworzony przez:
 - Mikołaja Gaweł-Kucab 
 - Wiktora Golicza 

na konkurs Hack Heroes 2025.
## Działanie wtyczki
Aby użyć wtyczki należy wejść na dowolny artykuł na stronie z wiadomościami np: wp.pl/ \
następnie kliknąć w rozszerzenia i wybrać wtyczkę FactCheck. \
W wtyczce należy wybrać artykuł po czym wcisnąć przycisk rozpocznij analizę. \
Ze wzgledu na użycie modelu AI powinno to zająć około ~20s. - w zależności od długości artykułu.\
W przypadku gdy na stronie nie wykryło artykułu wtyczka będzie wyświetlać odpowiedni komunikat.\
Po zakończonej analizie części artykułu zostaną pozaznaczane na 3 kolory: 
 - czerwony: opinia, specyficzna perspektywa
 - zielony: fakt, informacja
 - szary: niepewne, niezakwalifikowane
## Demonstracja działania rozszerzenia
![preview](./preview/preview.gif)
## Dodatkowa fukncjonalność
 - Wsparcie dla jasnego i ciemnego trybu artykułu
 - Cache przeanalizowanych dokumentów w celu zapobiegania ponownej analizie tego samego artykułu
 - Podpowiedzi określające czemu dana część artykułu jest oceniona jako fakt albo opinia
 - Pasek progresu wraz z przewidywanym czasem oczekiwania
## Uruchmienie wtyczki
1. Pierwszym krokiem jest pobranie gotowej wersji(rekomendowane) wtyczki albo zkompilowanie własnej z kodu źródłowego
2. Aby uruchomić wtyczkę należy wejść w kartę rozszerzeń w przeglądarce Google Chrome wpisując w pasek adresu: `chrome://extensions/`
3. Włącz `Tryb dewelopera` w celu możliwości dodawania niezpakowanych rozszerzeń
4. Ostatnim krokiem jest użycie opcji `Załaduj rozpakowane` i wybranie folderu w którym rozpakowałeś wtyczkę albo ją zkompliowaliśmy
## Kompilacja programu
### Kompilacja wtyczki
W celu konfiguracji wtyczki należy utworzyć plik `.env` w katalogu `extension` i wypełnić go następującymi wartościami:
```bash
SERVER=http://localhost:3000  #adress serwera
SERVER_USER=twoja_nazwa #nazwa użytkownika na serwerze
SERVER_PASS=twoje_hasło #hasło
#w przypadku hostowania serwera lokalnie w pola można zostawić z wpisanymi wartościami domyślnymi
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

ANALYZER_MAX_SENTENCES=300 # maksymalna liczba zdań w artykule
ANALYZER_TEMPERATURE=0.1 # poziom stabilności modelu
ANALYZER_CACHE_TTL_MS=600000 #długość przechowywania modelu w cache-u 
```
przed uruchomieniem serwera wymaga jest instalacja pakietów node.js w tym celu używamy komendy \
`npm install` \
następnie w celu kompilacji serwera musimy użyć \
`npm run build` aby uruchomić serwer należy użyć komendy `npm run start` \
w celach debugowania zamiast dwóch powyższych komend można użyć też `npm run dev` które posiada odświeżanie po edycji kodu
## Użyte technologie

[![Node.js](https://img.shields.io/badge/Node.js-≥24.11.1-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) 
[![OpenRouter](https://img.shields.io/badge/OpenRouter-API-000000?style=flat-square&logo=openai&logoColor=white)](https://openrouter.ai/)