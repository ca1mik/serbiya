"use client";
import { useState } from "react";
import { useUiText } from "@/i18n/ui-client";
type Unit = { id: string; sourceUnit: string; normalizedUnit: string };
type Template = {
  id: string;
  name: string;
  mapping: Record<string, string>;
  active: boolean;
};
export function MappingManager({
  initialUnits,
  templates,
}: {
  initialUnits: Unit[];
  templates: Template[];
}) {
  const t = useUiText();
  const [units, setUnits] = useState(initialUnits);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "unit",
        sourceUnit: source,
        normalizedUnit: target,
      }),
    });
    const data = await response.json();
    setMessage(
      t(
        response.ok
          ? "Mapiranje je sačuvano."
          : (data.error?.message ?? "Greška"),
      ),
    );
    if (response.ok) {
      setUnits((current) => [
        ...current.filter((x) => x.sourceUnit !== data.sourceUnit),
        data,
      ]);
      setSource("");
      setTarget("");
    }
  }
  return (
    <div className="mapping-sections">
      <section className="work-panel">
        <div className="panel-heading">
          <div>
            <h2>{t("Jedinice mere")}</h2>
            <p>
              {t(
                "Izvorna jedinica se prevodi u operativnu jedinicu pre slanja.",
              )}
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("Izvorna jedinica")}</th>
                <th>{t("Mapirano na")}</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id}>
                  <td>{unit.sourceUnit}</td>
                  <td>
                    <strong>{unit.normalizedUnit}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={save} className="mapping-form">
          <label>
            {t("Izvorna jedinica")}{" "}
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              required
              placeholder={t("npr. kutija")}
            />
          </label>
          <label>
            {t("Operativna jedinica")}{" "}
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
              placeholder={t("npr. KUT")}
            />
          </label>
          <button className="button primary">{t("Sačuvaj mapiranje")}</button>
        </form>
        {message && (
          <p role="status" className="inline-message">
            {message}
          </p>
        )}
      </section>
      <section className="work-panel">
        <div className="panel-heading">
          <div>
            <h2>{t("Šabloni kolona")}</h2>
            <p>{t("Sačuvani šabloni mogu se primeniti pri svakom uvozu.")}</p>
          </div>
        </div>
        {templates.map((template) => (
          <div className="template-row" key={template.id}>
            <strong>{template.name}</strong>
            <span>
              {Object.keys(template.mapping).length} {t("kolona ·")}{" "}
              {t(template.active ? "Aktivno" : "Neaktivno")}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
