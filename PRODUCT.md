# Product

## Register

product

## Users
Deux publics simultanés :
1. **Recruteurs / non-experts** — découvrent le projet en portfolio. Doivent comprendre en 10 secondes « la machine mesure-t-elle juste ? » sans connaître la métrologie.
2. **Métrologues / qualiticiens** — veulent vérifier la rigueur : z-score, σ dynamique, limites ±2σ/±3σ, traçabilité.

Contexte d'usage : consultation au calme (entretien, revue de portfolio), écran de bureau majoritairement.

## Product Purpose
Reproduire, en application web statique, un outil Excel/VBA de contrôle de déviation d'un spectromètre d'émission optique en laboratoire ISO 17025. Surveiller dans le temps si les mesures sur matériaux de référence certifiés restent dans les limites, et corréler les dérives avec les interventions de maintenance. Succès = un recruteur comprend la valeur métier, un métrologue fait confiance aux calculs.

## Brand Personality
Précis, calme, instrumental. Comme la lecture d'un appareil de mesure bien réglé : sobre, lisible, sans esbroufe. Trois mots : **calibré, lisible, rigoureux.**

## Anti-references
- Le « dashboard SaaS générique » : hero-metric géant + gradient + cartes-icônes répétées.
- Les graphiques chargés de librairies (Chart.js & co.) : ici tout est SVG natif.
- Le registre « startup growth » (flèches vertes, % qui montent). Ce n'est pas un tableau de croissance, c'est un instrument de contrôle.

## Design Principles
1. **Façade simple, fond rigoureux** — la réponse en clair d'abord, la preuve technique à un clic.
2. **La couleur porte un sens unique** — le vert/ambre/rouge ne sert qu'au statut, jamais à la décoration. La marque est neutre + un seul accent.
3. **Le chiffre est roi** — données numériques en chasse fixe (mono), alignées, traçables jusqu'au réplicat.
4. **Montrer le travail** — exposer l'algorithme et l'anonymisation, c'est le sujet du portfolio.

## Accessibility & Inclusion
WCAG AA sur tous les contrastes. Statut jamais par la couleur seule (texte + forme + bordure). Navigation clavier complète (onglets ARIA, focus visible). `prefers-reduced-motion` respecté. Daltonisme : statuts différenciés par libellé et icône, pas seulement la teinte.
