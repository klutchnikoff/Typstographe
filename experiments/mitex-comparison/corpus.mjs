import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const prose =
  "La modélisation décrit les relations entre les grandeurs observées et les hypothèses retenues. Les résultats doivent être interprétés en tenant compte des conditions de mesure et des limites de la méthode. Nous examinons ensuite la stabilité des estimations et la sensibilité aux variations des paramètres.";
const templates = [
  String.raw`\frac{a_{I}+b_{I}}{1+x^2}=\alpha_{I}`,
  String.raw`\int_0^1 x^{I}\,dx=\frac{1}{I+1}`,
  String.raw`\sum_{k=1}^{I} k = \frac{I(I+1)}{2}`,
  String.raw`\begin{pmatrix}I & 2 \\ 3 & 4\end{pmatrix}`,
  String.raw`\begin{aligned}x_{I}+y&=2\\x-y&=I\end{aligned}`,
  String.raw`f_{I}(x)=\begin{cases}x^2 & x>0\\-x & x\leq 0\end{cases}`,
  String.raw`\lim_{n\to\infty}\left(1+\frac{I}{n}\right)^n=e^{I}`,
  String.raw`\nabla\cdot\mathbf{u}_{I}=0`,
  String.raw`\mathbb{P}(X_{I}\leq x)=\int_{-\infty}^{x}f_{I}(t)\,dt`,
  String.raw`\cos^2(x_{I})+\sin^2(x_{I})=1`,
];
const text = (value) => ({ type: "text", text: value });
const paragraph = (value) => ({
  type: "paragraph",
  content: value ? [text(value)] : [],
});
const corpora = [10, 50, 200].map((count) => {
  const name = `article-${count}`;
  const content = [
    paragraph("Nous présentons les résultats de cette étude. " + prose),
  ];
  const formulas = [];
  for (let i = 1; i <= count; i++) {
    if (i % 10 === 1)
      content.push({
        type: "heading",
        attrs: { level: 1, anchor: `section-${i}` },
        content: [text(`Analyse ${Math.ceil(i / 10)}`)],
      });
    const source = templates[(i - 1) % templates.length].replaceAll(
      "I",
      String(i),
    );
    formulas.push(source);
    const block = i % 5 < 2;
    const formula = {
      type: block ? "mathBlock" : "mathInline",
      attrs: {
        language: "latex",
        alt: "",
        ...(block ? { anchor: `equation-${i}`, alias: `result-${i}` } : {}),
      },
      content: [text(source)],
    };
    content.push(
      block
        ? formula
        : {
            type: "paragraph",
            content: [
              text("La relation "),
              formula,
              text(" précise le comportement étudié. " + prose),
            ],
          },
    );
    if (block) content.push(paragraph(prose));
  }
  content.push(paragraph("Conclusion. " + prose), paragraph());
  return {
    name,
    formulas,
    equations: count,
    blocks: content.filter((n) => n.type === "mathBlock").length,
    document: { type: "doc", content },
  };
});
writeFileSync(
  resolve(process.argv[2] || "output/mitex-benchmark/corpora.json"),
  JSON.stringify(corpora, null, 2) + "\n",
);
