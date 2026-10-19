// Seules ces entrées sont accessibles depuis l'extérieur d'un module.
const PUBLIC_ENTRIES = '^src/modules/[^/]+/(index\\.ts|contracts\\.ts|ui\\.tsx)$'

module.exports = {
  forbidden: [
    {
      name: 'module-encapsulation',
      comment: "Un module n'importe que les entrées publiques des autres modules.",
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/[^/]+/', pathNot: ['^src/modules/$1/', PUBLIC_ENTRIES] },
    },
    {
      name: 'outside-uses-public-entries',
      comment: "Hors des modules, on n'importe que leurs entrées publiques.",
      severity: 'error',
      from: { pathNot: '^src/modules/' },
      to: { path: '^src/modules/', pathNot: PUBLIC_ENTRIES },
    },
    {
      name: 'pure-domain',
      comment: "Le domaine n'importe que son propre répertoire domain/.",
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/domain/' },
      to: { pathNot: '^src/modules/$1/domain/' },
    },
    {
      name: 'platform-ignores-modules',
      comment: 'La plateforme ignore les modules métier et la racine de composition.',
      severity: 'error',
      from: { path: '^src/platform/' },
      to: { path: '^src/(modules|bootstrap)/' },
    },
    {
      name: 'client-without-server-code',
      comment: "Le code client n'importe aucun code serveur, sauf des types.",
      severity: 'error',
      from: { path: '(^src/modules/[^/]+/ui\\.tsx$)|(^src/ui/)' },
      to: {
        path: '^src/(platform/|bootstrap/|modules/[^/]+/(api\\.ts|index\\.ts|application/|infrastructure/))',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'no-circular',
      comment: 'Aucune dépendance circulaire, même indirecte.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.ts$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
}
