#!/bin/bash
# installer-sam.sh - guided install for Sam's LG OLED65C9, in French. Started by Installer-TV.cmd (double-click on Windows) or from Git Bash.
# It only wraps what already exists: SSH key setup, ./install.sh --check (read-only), then ./install.sh (asks before each stage).
set -u
cd "$(dirname "$0")/.." || exit 1
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ask() { read -r -p "$1 [o/N] " r; [ "$r" = o ] || [ "$r" = O ] || [ "$r" = y ] || [ "$r" = Y ]; }

say "Installation de l'accueil personnalisé sur la TV"
echo "La TV doit être allumée, rootée (Homebrew Channel installé, SSH activé) et sur le même réseau que ce PC."

IP=""; [ -f tv.conf ] && IP=$(sed -n 's/^TV_IP=//p' tv.conf | head -1)
if [ -n "$IP" ]; then read -r -p "Adresse IP de la TV [$IP] : " r; [ -n "$r" ] && IP=$r
else read -r -p "Adresse IP de la TV (Réglages LG, Réseau) : " IP; fi
echo "$IP" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || { echo "Adresse invalide : $IP"; exit 1; }
printf 'TV_IP=%s\nTV_USER=root\n' "$IP" > tv.conf

say "1/4  Clé SSH de ce PC"
[ -f ~/.ssh/id_ed25519 ] || { mkdir -p ~/.ssh && ssh-keygen -q -t ed25519 -N "" -f ~/.ssh/id_ed25519 && echo "Clé créée."; }
if ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new "root@$IP" true 2>/dev/null; then
  echo "La TV accepte déjà la clé de ce PC."
else
  echo "Copie de la clé sur la TV. Mot de passe demandé : celui du root de la TV (par défaut : alpine)."
  ssh -o StrictHostKeyChecking=accept-new "root@$IP" 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys' < ~/.ssh/id_ed25519.pub \
    || { echo "Échec de la connexion. Vérifie l'adresse, que la TV est allumée et que SSH est activé dans le Homebrew Channel."; exit 1; }
  ssh -o BatchMode=yes -o ConnectTimeout=8 "root@$IP" true 2>/dev/null && echo "Clé installée." || { echo "La clé ne fonctionne pas encore."; exit 1; }
fi

say "2/4  Vérification de compatibilité (ne modifie rien)"
./install.sh "$IP" --check 2>&1 | tee diagnostic-tv.txt
echo; echo "Résultat enregistré dans diagnostic-tv.txt (à envoyer à Claude en cas de doute)."
if grep -q '\[NO\]' diagnostic-tv.txt; then echo "Un élément indispensable manque : installation arrêtée. Envoie diagnostic-tv.txt à Claude."; exit 1; fi
if grep -q '\[WARN\]' diagnostic-tv.txt; then
  echo "La TV diffère de la TV de test (lignes [WARN] ci-dessus)."
  grep -q 'no com.webos.app.fullhome' diagnostic-tv.txt && { echo "L'accueil de LG n'a pas le nom attendu : installation arrêtée. Envoie diagnostic-tv.txt à Claude, il adaptera le réglage."; exit 1; }
  ask "Continuer quand même ?" || exit 1
fi

say "3/4  Installation"
echo "Le script demande avant chaque étape (réponds y). Conseil : à la dernière question (« Install the hook? », démarrage automatique), réponds n la première fois."
echo "Tant que ce n'est pas installé, un redémarrage de la TV la remet d'origine. Relance ce script plus tard pour l'installer."
ask "Lancer l'installation maintenant ?" || exit 0
./install.sh "$IP"

say "4/4  Terminé"
echo "Sur la TV : Réglages (bouton en haut à droite de l'accueil), Accueil et veille : Thème, Favoris, Animation de veille."
echo "Tout annuler : ./revert.sh (la TV redémarre d'origine)."
