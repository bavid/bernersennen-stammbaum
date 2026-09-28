# PLZ-Daten

`plz-de.json` ordnet jeder deutschen Postleitzahl eine gemittelte Koordinate und einen Ortsnamen zu:
`{ "10115": [52.532, 13.385, "Berlin"] }`.

**Quelle:** [GeoNames](https://www.geonames.org/) (Postal Code-Datensatz Deutschland, Datei `DE.txt`),
Lizenz [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

**Neu erzeugen:** GeoNames-`DE.txt` besorgen und ausführen:

```sh
node scripts/build-plz.js <Pfad zu DE.txt>
```
