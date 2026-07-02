import { config, fields, collection, singleton } from '@keystatic/core';

export default config({
  storage: {
    kind: 'local',
  },
  collections: {
    posts: collection({
      label: 'Posts',
      slugField: 'title',
      path: 'content/posts/*',
      format: { contentField: 'content' },
      entryLayout: 'content',
      schema: {
        title: fields.slug({
          name: {
            label: 'Title',
            validation: { isRequired: true, length: { min: 1 } },
          },
        }),
        summary: fields.text({
          label: 'Summary',
          validation: { length: { min: 1 } },
        }),
        content: fields.markdoc({
          label: 'Content',
        }),
      },
    }),
  },
});
