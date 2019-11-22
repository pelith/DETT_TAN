const canonicalUrl = 'https://tangerine.dett.cc'

module.exports = {
  root: './src',
  data: {
    title: 'DETT Tangerine',
    description: '基於 Tangerine 智慧合約的 BBS 系統' ,
    canonicalUrl,
  },
  filters: {
    prefixUrl: path => path ? `${canonicalUrl}/${path}` : `${canonicalUrl}`
  },
}
