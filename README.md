# Atelier de traduction SRT

Application web locale pour travailler la traduction de sous-titres en classe.

## Fonctionnalites

- Import d'un fichier `.srt`
- Chargement d'un fichier `.srt` de traduction deja commence
- Chargement d'une video locale
- Bouton de lecture video depuis `premier timecode - 3 secondes` (valeur modifiable dans `app.js`)
- Affichage des sous-titres traduits en surimpression pendant la lecture video
- Bouton Bonnes pratiques ouvrant une fenetre de rappel des regles de sous-titrage
- Affichage en deux colonnes:
  - gauche: original (lecture seule)
  - droite: traduction eleve (editable)
- Verification des contraintes de sous-titrage:
  - 2 lignes maximum par sous-titre (configurable dans le fichier javascript)
  - 37 caracteres maximum par ligne (configurable dans le fichier javascript)
  - compteur en direct (lignes et caracteres)
  - surlignage rouge en cas de depassement
- Export du travail au format `.srt`
- Entete de commentaires dans l'export avec:
  - nb de sous-titres > 2 lignes (configurable dans le fichier javascript)
  - nb de sous-titres avec au moins une ligne > 37 caracteres (configurable dans le fichier javascript)
  - format: `nb >37 : X sur Y`
- Interface responsive (ordinateur et mobile/tablette)
- Page dediee "version professeur" (`professeur.html`) pour comparer l'original avec plusieurs fichiers eleves
- Selection d'un dossier contenant les exports eleves (`.srt`)
- Detection des correspondances par timecode et affichage de tous les fichiers eleves dans une colonne unique
- Une couleur de fond dediee par fichier eleve, visible dans la legende et dans la colonne "Eleves"
- Colonne "Valide" dans la vue professeur (case a cocher par sous-titre), entre "Original" et "Eleves"
- Affichage du nombre de sous-titres valides par fichier eleve dans "Fichiers eleves detectes" (format `valides/total`)
- Affichage d'une `NOTE: x/20` par fichier eleve, calculee a partir de `valides/total`
- Sauvegarde locale de l'etat professeur (cases cochees, calculs, notes) avec restauration automatique pour le meme fichier original
- Sauvegarde locale des informations de selection (nom du fichier original, chemin relatif du dossier eleves, liste des fichiers selectionnes)
- Export du bilan professeur en CSV (`fichier_eleve`, `total_sous_titres`, `valides`, `pourcentage_match`, `note_sur_20`)

## Utilisation

1. Ouvrir `index.html` dans un navigateur.
2. Cliquer sur **Charger un fichier SRT**.
3. Si besoin, cliquer sur **Charger une traduction en cours** pour reprendre la seance precedente.
4. Traduire les sous-titres dans la colonne de droite.
5. Cliquer sur **Telecharger la traduction** pour recuperer le fichier final.

Le fichier exporte est nomme: `nom_du_fichier_traduit.srt`.

## Mode professeur

1. Ouvrir `professeur.html` (ou cliquer sur **Version professeur** depuis `index.html`).
2. Choisir le fichier `.srt` original.
3. Choisir le dossier contenant les fichiers `.srt` des eleves.
4. Consulter le tableau: original + valide + eleves (une seule colonne eleves coloree par fichier).
5. Cocher la case "Valide" pour les sous-titres que vous validez.
