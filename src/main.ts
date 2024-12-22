import { pluginApi, registerAPI } from '@vanakat/plugin-api'
import { App, Notice, Plugin, WorkspaceRibbon } from 'obsidian'

declare global {interface Window {Calendarium: Plugin | any, CalendariumPublish: Function}}

type AppWithCommandsAndPlugins = App & {commands: any, plugins: any}
type WorkspaceRibbonWithItems = WorkspaceRibbon & {items: {id: string, buttonEl: HTMLElement}[]}

export default class CalendariumPublish extends Plugin {
	private Calendarium: Plugin | any
	private CacheNotes: Plugin | any

	async onload() {
		this.app.workspace.onLayoutReady(this.init)
	}

	public onunload = () => {}

	private init = () => {
		let app = (this.app as AppWithCommandsAndPlugins)
		registerAPI("Calendarium Publish", this, this)

		// This requires Dataview Publisher as well. Won't be accessing it but use plugin-api to verify and notify the user
		if (app.plugins.plugins["dataview-publisher"]) {
			registerAPI("Dataview Publisher", app.plugins.plugins["dataview-publisher"], app.plugins.plugins["dataview-publisher"])
		}
		pluginApi("Dataview Publisher")
		
		// Calendarium is in global but we're using plugin-api so let's just register it so we can use everything the same way
		registerAPI("Calendarium", window.Calendarium, window.Calendarium.plugin)
		
		this.Calendarium = pluginApi("Calendarium")
		this.CacheNotes = pluginApi('Cache Notes')

		window.CalendariumPublish = (calendar: string) => this.dump(calendar)

		// Register timeline block renderer
		// This doesn't actually work with Publish as Markdown is not post-processed before the upload.
		this.registerMarkdownCodeBlockProcessor('calendarium-publish', async (source, el, ctx) => {
			await this.fromMarkdown(source, el)
		})

		// Override publish lol
		this.overrideCommand("publish:view-changes", (original_callback) => {
			app.commands.executeCommandById('dataview-publisher:update-blocks')
			original_callback()
		})

		let ribbon = (this.app.workspace.leftRibbon as WorkspaceRibbonWithItems)
		ribbon.items.filter((item: any) => item.id == "publish:Publish changes...").forEach((item) => {
			const original_callback = item.buttonEl.onclick?.bind(item.buttonEl)
			item.buttonEl.onclick = (e) => {
				app.commands.executeCommandById('dataview-publisher:update-blocks')
				if (original_callback) original_callback(e)
			}
		})
	}

	private overrideCommand = (command: string, callback: (o: Function) => void) => {
		const command_definition = (this.app as any).commands?.commands?.[command]
		const original_callback = command_definition?.callback
		if (typeof original_callback === "function") {
			command_definition.callback = () => {
				callback(original_callback)
			}
		}
	}

	private ensureRequirements = ():boolean => {
		return this.Calendarium && this.CacheNotes
	}

	private render = (calendar: string, container: HTMLElement) => {
		container.setAttr("data-event", "calendarium")
		container.setAttr("data-month", "0")

		if (!this.ensureRequirements()) return container
		
		const c = this.Calendarium.getAPI(calendar)
		const data = c.getStore().eventStore.calendar
		data.events = c.getEvents()

		for(let event in data.events) {
			if(data.events[event].note) {
				if (!this.CacheNotes.get(data.events[event].note)) {
					this.CacheNotes.cacheFile(data.events[event].note)
					new Notice("Calendarium Publish: Missing cache for note " + data.events[event].note + ".")
				} else {
					data.events[event].description = this.CacheNotes.get(data.events[event].note)
				}
			}
		}

		container.setText(JSON.stringify(data))
		return container
	}

	private dump = (calendar: string) => {
		return this.render(calendar, createDiv()).outerHTML
	}

	private async fromMarkdown(source: string, el: HTMLElement) {
		this.render(source, el)
	}
}