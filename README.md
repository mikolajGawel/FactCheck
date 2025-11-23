# Factcheck

Wtyczka do przeglądarki chrome pozwalająca na analizę treści artykułów informacyjnych. \
Pozwala stwierdzić czy podany tekst jest faktem czy opinią - opracowany przez nas algorytm wykorzystuje do tego sztuczną inteligencję. \
Naszym celem jest walka z fake newsami oraz dezinformacją, która jest coraz bardziej powszechna w mediach. \
Wtyczka ma być swego rodzaju lupą analityczną, która przetwarza dokument aby pomóc użytkownikowi odróżnić stronnicze opinie od faktów. \
Projekt stworzyli:

- Mikołaj Gaweł-Kucab
- Wiktor Golicz

na konkurs [Hack Heroes 2025](https://www.hackheroes.pl/index.php/hack-heroes-2025/).

## Działanie wtyczki

Aby użyć wtyczki należy wejść na dowolny artykuł na stronie z wiadomościami np: [wp.pl](https://wp.pl), \
a następnie kliknąć w rozszerzenia i wybrać wtyczkę FactCheck. W okienku wtyczki należy wybrać artykuł, po czym wcisnąć przycisk rozpocznij analizę. \
Ze wzgledu na użycie modelu AI powinno to zająć około 20 sekund, choć czas może się różnić w zależności od długości artykułu.\
W przypadku gdy na stronie nie został wykryty żaden artykuł, wtyczka będzie wyświetlać odpowiedni komunikat.\
Po zakończonej analizie części artykułu zostaną pozaznaczane na 3 kolory:

- czerwony: opinia, specyficzna perspektywa
- zielony: fakt, informacja
- szary: niepewne, niezakwalifikowane

## Demonstracja działania rozszerzenia

![preview](./preview/preview.gif)

## Dodatkowa funkcjonalność

- Wsparcie dla jasnego i ciemnego trybu artykułu
- Cache przeanalizowanych dokumentów w celu zapobiegania ponownej analizie tego samego artykułu
- Podpowiedzi określające czemu dana część artykułu jest oceniona jako fakt albo opinia
- Pasek progresu wraz z przewidywanym czasem oczekiwania

## Uruchomienie wtyczki

1. Pierwszym krokiem jest pobranie gotowej wersji(rekomendowane) wtyczki albo [skompilowanie własnej z kodu źródłowego](#kompilacja-wtyczki-z-kodu-źródłowego)
2. Aby uruchomić wtyczkę należy wejść w kartę rozszerzeń w przeglądarce Google Chrome wpisując w pasek adresu: `chrome://extensions/`
3. Włącz `Tryb dewelopera` w celu możliwości dodawania niezpakowanych rozszerzeń
4. Ostatnim krokiem jest użycie opcji `Załaduj rozpakowane` i wybranie folderu w którym rozpakowałeś wtyczkę albo ją zkompliowaliśmy

## Kompilacja programu

> [!IMPORTANT]
> Upewnij się, że masz zainstalowane środowisko nodeJS w wersji co najmniej 23.

### Kompilacja i uruchomienie serwera z kodu źródłowego

> [!NOTE]
> W celu działania serwera wymagane jest posiadanie własnego klucza API [OpenRouter](https://openrouter.ai/).

Serwer wymaga pliku `.env` z konfiguracją. Plik powinien zostać umieszczony:

1. W głównym katalogu projektu (`./.env`), jeśli uruchamiasz serwer za pomocą Docker-a.
2. W katalogu `server/` (`.env`), jeśli uruchamiasz serwer bezpośrednio.

Wymagane zmienne:

```bash
OPENROUTER_API_KEY=twój_klucz # klucz API OpenRouter (wymagany)
PORT=3000 # port serwera (opcjonalny, domyślnie 3000). Nie zmieniaj jeśli używasz Docker-a (wtedy jest to wewnetrzny port w kontenerze).
HOST_PORT=6767 # port serwera (tylko jeśli używasz Docker-a)
```

Opcjonalne zmienne (mają rozsądne wartości domyślne):

```bash
OPENROUTER_MODEL=google/gemini-2.5-flash-preview-09-2025 # model AI do użycia (OpenRouter: https://openrouter.ai/models)
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_APP_NAME=FactCheck Analyzer

ANALYZER_MAX_SENTENCES=300    # maksymalna liczba zdań do analizy
ANALYZER_TEMPERATURE=0.1      # parametr stabilności modelu
ANALYZER_CACHE_TTL_MS=600000  # czas przechowywania cache-u (ms)
```

Aby uruchomić serwer:

1. Zainstaluj pakiety: `npm install` (w katalogu `server/`)
2. Kompiluj i uruchamiaj:
    - Tryb produkcyjny: `npm run build` następnie `npm run start`
    - Tryb deweloperski: `npm run dev` (z automatycznym odświeżaniem)
    - Przy użyciu Docker-a: `docker-compose up` (serwer będzie dostępny na porcie określonym w `HOST_PORT`)

> [!NOTE]
> W przypadku uruchomienia poprzez Docker-a, zostanie również uruchomiony projekt "dashboard" pokazujacy statystyki związane z użyciem sztucznej inteligencji.
> Działa na porcie 5173.

### Kompilacja wtyczki z kodu źródłowego

Należy utworzyć plik `.env` w katalogu `extension` i wypełnić go następującymi wartościami:

```bash
SERVER=http://localhost:3000  # adres serwera (można pominąć jeśli używa się domyślnego = http://localhost:3000)

# Poniższe tylko jeśli używasz https oraz http Basic authentication
# Ma to zastosowanie jeśli łączysz się do serwera przez proxy (np. to zdefiniowane w folderze /proxy)
# W przypadku hostowania serwera lokalnie (docker lub tryb dev), poniższe pola można zostawić puste
SERVER_USER=twoja_nazwa # nazwa użytkownika na serwerze
SERVER_PASS=twoje_hasło # hasło
```

Następnie w katalogu `extension` należy najpierw pobrać pakiety używając `npm install`, \
a następnie w celu kompilacji wtyczki należy użyć komendy `npm run build`. \
Gotowa wtyczka będzie się znajdować w katalogu `/extension/dist`

## Użyte technologie

[![Node.js](https://img.shields.io/badge/Node.js-≥24.11.1-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-API-000000?style=flat-square&logo=openai&logoColor=white)](https://openrouter.ai/)
