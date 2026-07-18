/** @odoo-module **/

// A scoped list-view variant that shows a yellow "how it works" help banner at the
// bottom of the list. Odoo list views can't hold a banner natively, so we subclass
// the list controller and add one via template inheritance. The banner text is
// chosen by the model, so the SAME js_class serves both the Paper Sizes and the
// Invoice Layouts lists.
import { registry } from "@web/core/registry";
import { listView } from "@web/views/list/list_view";
import { ListController } from "@web/views/list/list_controller";

export class HelpBannerListController extends ListController {
    setup() {
        super.setup();
        const model = this.props.resModel;
        this.helpKey =
            model === "pos.invoice.paper.size" ? "paper_sizes" :
            model === "pos.invoice.layout" ? "layouts" : "";
    }
}
HelpBannerListController.template = "pos_dynamic_invoice.HelpBannerListView";

registry.category("views").add("pdi_help_list", {
    ...listView,
    Controller: HelpBannerListController,
});
