/**
 * Stany:
 * 0: idle
 * 1: progress
 * 2: completed
 * -1: error
 */
// Zmieniamy jobState na obiekt (mapę), aby przechowywać stan dla każdej zakładki.
let tabJobStates = {}; // Klucz: tabId (liczba), Wartość: stan (liczba)

// Przechowujemy ID ostatnio aktywnej zakładki
let activeTabId = null; 

// Funkcja pomocnicza do pobierania stanu dla aktywnej zakładki
function getCurrentJobState() {
    return activeTabId ? (tabJobStates[activeTabId] || 0) : 0;
}

// Funkcja pomocnicza do ustawiania stanu dla zakładki
function setJobState(tabId, state) {
    tabJobStates[tabId] = state;
    // Opcjonalnie: usuń stany dla nieistniejących zakładek, jeśli to konieczne (np. onRemoved)
}

// Funkcja pomocnicza do resetowania stanu i powiadamiania
function resetAndNotify(tabId) {
    setJobState(tabId, 0); // Ustaw stan na 'idle' (0)
    chrome.runtime.sendMessage({ type: "stateUpdated", jobState: 0 }); 
    console.log(`Reset jobState for Tab ${tabId} to 0 (idle).`);
}

// --- 1. RESET JOB STATE ON TAB URL CHANGE (NEW CARD/NAVIGATION) ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // ⚠️ WAŻNE: Resetujemy tylko, jeśli URL się zmienił i zakładka jest AKTYWNA.
    // Chcemy, aby nawigacja w aktywnej zakładce resetowała stan, ale nie chcemy resetować 
    // stanu w nieaktywnych zakładkach, gdy są ładowane w tle.
    if (changeInfo.url && tabId === activeTabId) {
        console.log(`Tab ${tabId} navigated to new URL: ${changeInfo.url}. Checking for existing state...`);
        
        // Sprawdzamy, czy zakładka ma już stan (np. jeśli powrócono do strony z ukończonym zadaniem)
        // Jeśli nie, resetujemy. W przypadku zmiany URL na tej samej aktywnej zakładce, 
        // to faktycznie chcemy zresetować. W przeciwnym razie trudno byłoby 
        // automatycznie określić "czy powrócono do tej samej strony".

        // Najbezpieczniejszą i najprostszą implementacją jest:
        // Przy zmianie URL aktywnej zakładki, resetujemy do 0.
        resetAndNotify(tabId);
    }
});

// --- 2. ZAPISZ STAN ZAKŁADKI I POBIERZ/ZRESETUJ DLA NOWEJ ZAKŁADKI PRZY PRZEŁĄCZANIU ---
chrome.tabs.onActivated.addListener((activeInfo) => {
    const newTabId = activeInfo.tabId;
    
    // Tylko kontynuuj, jeśli aktywna zakładka faktycznie się zmienia
    if (newTabId !== activeTabId) {
        
        // Krok 1: Zapisz stan dla starej aktywnej zakładki (jeśli istniała)
        // Stan już jest zapisany w 'tabJobStates' przez odbiorniki wiadomości (sekcje 5, 6), 
        // więc nie musimy nic robić OPRÓCZ zachowania ID.

        console.log(`Switched from Tab ${activeTabId} to Tab ${newTabId}.`);
        
        // Krok 2: Ustaw nową aktywną zakładkę
        activeTabId = newTabId;
        
        // Krok 3: Pobierz stan dla nowo aktywowanej zakładki.
        const stateForNewTab = getCurrentJobState();
        
        // Krok 4: Powiadom popup/inne części o stanie nowej aktywnej zakładki.
        chrome.runtime.sendMessage({ 
            type: "stateUpdated", 
            jobState: stateForNewTab 
        }); 
        
        console.log(`Loaded jobState for new Tab ${newTabId}: ${stateForNewTab}.`);
        
        // Opcjonalnie: Jeśli zdecydujesz, że przełączenie zawsze resetuje stan, 
        // zastąp Kroki 3 i 4 wywołaniem resetAndNotify(newTabId); 
        // Ale zgodnie z Twoją prośbą, powinniśmy go załadować.
    }
});

// --- 3. INITIAL ACTIVE TAB SETUP ---
// Znajdź aktualnie aktywną zakładkę, gdy rozszerzenie się ładuje/przeładowuje
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
        const initialTabId = tabs[0].id;
        activeTabId = initialTabId;
        // Upewnij się, że ma początkowy stan 'idle', jeśli go nie ma
        if (tabJobStates[initialTabId] === undefined) {
             setJobState(initialTabId, 0);
        }
    }
});

// --- Opcjonalnie: Czyszczenie stanu po zamknięciu zakładki ---
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (tabJobStates[tabId] !== undefined) {
        delete tabJobStates[tabId];
        console.log(`Tab ${tabId} closed. Job state removed.`);
    }
    if (tabId === activeTabId) {
        activeTabId = null; // Reset aktywnej zakładki, jeśli została zamknięta
    }
});
// -----------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const senderTabId = sender.tab ? sender.tab.id : null;
    
    // --- 4. POPUP REQUESTS STATE ---
    if (message.type === "getJobState") {
        // Zawsze odpowiadaj bieżącym stanem aktywnej zakładki
        sendResponse({
            jobState: getCurrentJobState()
        });
        return true; 
    }

    // --- 5. POPUP/JOB UPDATES STATE (i.e. 'progress') ---
    if (message.type === "setJobState") {
        if (senderTabId) {
            setJobState(senderTabId, message.jobState);
        } else {
            // Jeśli wiadomość pochodzi z popupu (i nie ma sender.tab), 
            // zakładamy, że dotyczy aktywnej zakładki
            setJobState(activeTabId, message.jobState);
        }
        // Upewnij się, że powiadamiasz inne komponenty
        chrome.runtime.sendMessage({ type: "stateUpdated", jobState: message.jobState });
    }

    // --- 6. JOB COMPLETION (from Content Script) ---
    if (message.type === "jobCompleted") {
        if (senderTabId) {
            setJobState(senderTabId, 2); // Ustaw na Completed
            chrome.runtime.sendMessage({ type: "stateUpdated", jobState: 2 }); 
        }
    }
    
    if (message.type === "jobFailed") {
        if (senderTabId) {
            setJobState(senderTabId, -1); // Ustaw na Error
            chrome.runtime.sendMessage({ 
                type: "stateUpdated", 
                jobState: -1, 
                error: message.error 
            });
        }
    }
});

// ... (chrome.action.onClicked listener powinien również działać na activeTabId)